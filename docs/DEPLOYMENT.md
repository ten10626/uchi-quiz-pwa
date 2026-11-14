# 本番環境記録

2026-11-14に新規作成・設定。既存の別アプリのプロジェクトには変更を加えていません。

| 項目 | 設定・確認結果 |
|---|---|
| 公開URL | https://ten10626.github.io/uchi-quiz-pwa/ |
| ソース | https://github.com/ten10626/uchi-quiz-pwa （ユーザー承認済みの公開リポジトリ） |
| Firebase project | uchi-quiz-ten10626-261114 |
| Firebase Console | https://console.firebase.google.com/project/uchi-quiz-ten10626-261114/overview |
| 課金 | billingEnabled=false、billingAccountNameなし |
| Authentication | subtype=FIREBASE_AUTH、email有効、passwordRequired=true |
| 認証ドメイン | localhost、127.0.0.1、ten10626.github.io、プロジェクト標準ドメイン |
| Firestore | (default)、Standard / Native、asia-northeast1、freeTier=true、PITR無効 |
| RTDB | デフォルト1インスタンス、asia-southeast1 |
| Rules / indexes | Firebase CLI deploy成功 |
| GitHub Pages | Actions方式、HTTPS有効、公開HTML HTTP 200 |
| 公開設定 | GitHub Actions VariablesへFirebaseの公開設定のみ登録 |
| 管理用秘密鍵 | 発行していない。ローカルFirebase CLIログインを使う管理経路を追加 |
| 初回会員 | 管理者1名のAuth有効・Firestore会員・RTDB許可の一致を確認済み |
| 本番インデックス | 全9件READY |
| 個人コード | 管理者がPC上で非表示入力する。GitHub・Web・チャットに書き込まない |

初回CIの37件のテスト・ビルド・公開は成功しています。
https://github.com/ten10626/uchi-quiz-pwa/actions/runs/43571276114

PC用の鍵なし管理経路は、Auth管理APIへのアクセス、Firestore会員情報の作成・取得・更新・削除、RTDB許可情報の作成・取得・削除を本番の一時検証データだけで確認済み。検証用データは削除しました。

初回の実ユーザー登録は、ユーザーがローカルTerminalで個人コードと表示名を決めて入力する手順です。実ブラウザの表示、スマホ実機、PWAの追加操作、複数端末での対戦は別途確認が必要です。公開URLのHTTP応答確認を画面の目視確認とは扱いません。

最新版のCI・再公開も成功しました（37件テスト・ビルド・Pages公開）。
https://github.com/ten10626/uchi-quiz-pwa/actions/runs/43572207600
