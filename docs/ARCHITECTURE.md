# 実装前設計 / 2026-11-14

## 構成・公開範囲
src/domain.js: 進行・集計・公開投影。src/backend.js: Firebase接続。src/main.js: 役割別画面。
Firestore members/{uid}: 管理スクリプトだけ発行、本人取得。users/{uid}/questions/{qid}: 所有者限定、管理者特例なし。
genres/{id}: 会員共有、参照件数を問題変更と同一transactionで更新。genreNames/{hexName}: 完全一致の名前予約。RulesでもUTF-8 hexの正規形を検証する。
RTDB allowed/{uid}: PC管理だけ発行。active/{uid}: 本人の参加ルーム復元用。
rooms/{6桁}/meta: 不変host UID。members: 回答者席、slots/s1〜s7で席数をルール上固定（待機時だけ参加退出）。public: 進行と発表可能な情報のみ。
host: 司会だけ読書き、スナップショット・履歴・得点・判定済みID。
answers/{token}/{uid}: 本人と司会が取得、本人が受付中1回提出。status/{token}: 回答者だけ読む。
buzz/{token}: transaction先着。results/{uid}: 本人の正誤統計。presence: onDisconnectの時刻とonlineと接続session。
親全体のread権限なし。Authのみ存在する非会員は業務データへの権限なし。

## 認証
コードは半角英数字6文字以上、小文字化してSHA-256 hex + @quiz.invalidを内部メールとする。
パスワードは正規化コード。理論上のハッシュ衝突も既存Authを上書きせず重複拒否。
Auth側の長さ制約に合わせ4096文字を上限とする。コードを配信ファイルやログに保存しない。

## 状態遷移
waiting → prepared → accepting → closed → revealed → 次問 / board / finished。
早押し誤答後は司会が再開、問題単位に再押下禁止者を記録。パネルはboardから司会が出題。
token単位に1回だけ統計計上。使用履歴は出題時追加、盤面割当時は追加しない。
開始前にmeta.lockedで入退室を止めて参加者を再読込、hostとpublicを同時保存する。進行はHost private transactionで確定後に公開投影。失敗時は再接続で再投影する。

## インデックス・取得
questionsのtype + random、およびtype + genreId + difficulty + random。一覧検索はtype/genreId/difficultyの組み合わせ + searchText + documentId。
一覧25件ずつ、検索はsearchText（問題文先頭256文字小文字化）の前方一致。抽選はrandom pivotから必要数までページ取得し、使用済IDを除外する。

## セルフチェック・制約
- Spark、Auth/Firestore/RTDBのみ、GitHub Pages配信。Functions/Storageなし。
- FirestoreとRTDB間のtransactionは不可能。PC管理はAuth無効→双方会員登録→Auth有効、削除はAuth無効→双方許可削除→Auth削除。repairで復旧。
- presenceは検知遅延あり。切断検知時刻で残り時間を保持、手動再開時deadline再設定。物理的切断と同時の停止は保証できない。
- 全端末不在では自動締切画面更新不能。Rulesで期限超過回答を拒否、host復帰時整合。
- 司会は正解と進行の信頼主体。
- Emulatorと実機確認が済むまで本番完成とは扱わない。

## ラウンド制のパネルジャンル選択

config.panelGenreModeはmanual（既存設定の既定値）またはrandom。randomは開始前に共有ジャンルIDの順序をシャッフルし、司会者の問題コレクションで各10/20/30の未使用問題が揃うものを5つ確保するまで調べる。5つに満たなければ開始せず件数を通知する。読み込んだ問題スナップショットはそのまま開始用poolへ渡し、同じ候補の二重取得を避ける。実際に選んだ5IDはconfig.genresへ保存してゲーム中固定、再戦時には使用済IDを反映して再抽選する。割り当てただけのパネル問題は使用済みにはしない。既存の所有者限定クエリ・インデックスを使用し、Rulesや公開範囲に変更はない。単独モードのパネル設定は手動選択のまま。
