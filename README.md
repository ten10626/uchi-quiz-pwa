# うちクイズ — 身内向けリアルタイム・クイズPWA

スマホで司会／回答、○×・4択・早押し・パネル、単独／固定ラウンド制に対応するFirebase Spark用の初期実装です。フロントエンドはGitHub Pagesに配信します。Firebase Functions・Storage・課金設定は使用しません。

**状態：本番インフラ設定・GitHub Pages公開済み。** 公開先は [うちクイズ](https://ten10626.github.io/uchi-quiz-pwa/)、ソースは [ten10626/uchi-quiz-pwa](https://github.com/ten10626/uchi-quiz-pwa) です。iPhone／Androidの実機確認、ホーム画面追加、画面の目視確認は未完了です。詳細は [検証記録](docs/VALIDATION.md) と [本番環境記録](docs/DEPLOYMENT.md) を参照してください。

## ファイル

```text
src/identity.js           コード正規化と内部メール変換
src/domain.js             状態遷移・問題抽選・公開投影・正誤集計
src/backend.js            Auth / Firestore / RTDB接続、transaction、presence
src/main.js, style.css    スマホ優先・司会／回答者別画面
firebase/                Firestore/RTDB Rules、複合インデックス
scripts/admin.mjs        PC専用アカウント管理（Webへ配信しない）
scripts/seed-emulator.mjs ローカルEmulator専用の検証データ
public/                  PWA manifest、アイコン、Service Worker
tests/                   進行ロジック、権限・競合、接続層統合テスト
docs/                    設計と検証記録
.github/workflows/       テスト→ビルド→GitHub Pages
```

設計・公開範囲・状態遷移は [ARCHITECTURE.md](docs/ARCHITECTURE.md) に記載しています。

## 1. 必要なもの

- Node.js 22.12以上（この実装は24.15で検証）、npm。
- Firebaseプロジェクト（Sparkのまま。請求先を接続しない）。
- GitHubリポジトリとGitHub Pagesが使用できるアカウント／リポジトリ設定。
- ルールテストを実行するPCにはJava 21以上。アプリの利用者には不要です。

```sh
npm ci
cp .env.example .env.local
```

## 2. Firebaseを作成・設定

1. Firebase Consoleでプロジェクトを作成し、Sparkであることを確認します。Analyticsは不要です。
2. Authentication → Sign-in methodで **メール／パスワード** を有効にします。メールリンク、匿名ログイン、利用者の登録画面は使用しません。コードの仕様に合わせ、パスワードポリシーは最小6文字、英大文字や記号の必須条件なしにします。
3. Cloud Firestoreの **Standard / Native / (default)** データベースを作成します。作成時の一時的なテストモードルールは使わず、下記のルールを適用します。
4. Realtime Databaseを1つ作成します。実際のDatabase URL（地域により `firebaseio.com` または `firebasedatabase.app`）を控えます。
5. Webアプリを登録し、表示される **公開のFirebase設定** を `.env.local` に入力します。
6. Authentication → Settings → Authorized domainsに、ローカル確認用の `localhost` と公開先 `YOUR_NAME.github.io` を必要に応じ追加します。リポジトリのパスは入力しません。

```dotenv
VITE_FIREBASE_API_KEY=公開のapiKey
VITE_FIREBASE_AUTH_DOMAIN=YOUR_PROJECT.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=YOUR_PROJECT
VITE_FIREBASE_DATABASE_URL=https://実際のDatabase-URL
VITE_FIREBASE_APP_ID=公開のappId
VITE_USE_EMULATORS=false
```

`VITE_`の値はビルドしたJavaScriptに含まれる公開情報です。アクセス制御はRulesで行います。**サービスアカウントJSON、秘密鍵、個人コード、Admin SDKの認証情報をこのファイル、GitHub Variables、Web用環境変数、public/に入れてはいけません。**

## 3. Rulesとインデックスを適用

```sh
npx firebase login
npx firebase deploy --project YOUR_PROJECT --only firestore:rules,firestore:indexes,database
```

デフォルト以外のFirestoreデータベースや複数RTDBには対応していません。コンソールで適用する場合は `firebase/firestore.rules` と `firebase/database.rules.json` をそれぞれのRules画面へ貼り、インデックスは `firebase/firestore.indexes.json` と同じ複合インデックスを作成します。インデックス構築完了まで待ってから利用します。

原本の所有者以外には問題を読めません。システム管理者も例外ではありません。ルーム親全体を取得できる権限は付けていません。得点はhostパスにのみ置き、回答者は自身のresultsだけ取得します。回答内容は本人／司会者専用、提出状況は○×・4択の回答者だけ共有します。

## 4. PCで会員を発行

Firebase Console → Project settings → Service accountsからAdmin SDK用キーを発行し、**リポジトリ外の管理用フォルダ** に保管します。ローカルスクリプトだけが読み込みます。既存のApplication Default Credentialsを使う場合はその認証も利用できます。

```sh
export GOOGLE_APPLICATION_CREDENTIALS='/リポジトリ外の絶対パス/service-account.json'
export GCLOUD_PROJECT='YOUR_PROJECT'
export FIREBASE_DATABASE_URL='https://実際のDatabase-URL'
npm run admin -- add
```

個人コードはターミナルの非表示入力、表示名は対話入力です。コードをシェル引数やログには出しません。コードは半角英数字6〜4096文字、小文字化後に重複を検査します。内部メールはSHA-256の64桁hex + `@quiz.invalid`、パスワードは正規化コードです。メール送受信は不要です。

```sh
npm run admin -- list
npm run admin -- init-admin USER_UID
npm run admin -- delete USER_UID
npm run admin -- repair USER_UID
```

- `add`: Authを無効状態で作成→Firestore会員→RTDB許可→Auth有効化。
- `list`: UID、表示名、無効状態、両DBの会員情報の有無、ジャンル管理者フラグを表示。個人コードは表示しません。
- `init-admin`: 既存会員をジャンル管理者にします。問題原本に対する特権は付与しません。
- `delete`: Auth無効化・refresh token取消→RTDB許可とFirestore会員の削除→Auth削除。途中失敗時は同じUIDで再実行できます。
- `repair`: 管理スクリプトで発行した内部メール形式の対象を無効化し、両DBを再同期して有効化します。追加途中の失敗を復旧するための操作です。

Auth／Firestore／RTDBを跨ぐ原子的transactionは提供されません。失敗メッセージのUIDで修復してください。削除では作問原本を自動削除しません。ジャンルの参照件数が残るので、会員を削除する前に本人が不要な問題を削除してください。会員削除はルーム利用が終わってから実行してください。

アプリ内にアカウント発行・削除・個人コード変更・端末追放機能はありません。

### 秘密鍵を使わずFirebase CLIログインでPC管理する場合

PCに `npx firebase login` でログイン済みなら、次の方法も使えます。OAuth認証情報は既存のFirebase CLIからメモリ内で利用し、秘密鍵やトークンをソースへ書き込みません。AuthはAdmin SDK、Firestore／RTDBの会員情報は管理用REST APIを使用します。

```sh
export GCLOUD_PROJECT='uchi-quiz-ten10626-261114'
export FIREBASE_DATABASE_URL='https://uchi-quiz-ten10626-261114-default-rtdb.asia-southeast1.firebasedatabase.app'
export QUIZ_USE_FIREBASE_LOGIN=true
npm run admin -- add
npm run admin -- list
npm run admin -- init-admin USER_UID
npm run admin -- delete USER_UID
```

この環境では `初回管理者を登録.command` をダブルクリックすると、初回専用の管理者登録を実行できます。最初に自分で決めた個人コードを入力してEnter、次に表示名を入力してEnterです。コードは画面に表示されません。初回フラグ `QUIZ_INITIAL_ADMIN=true` は既存会員がいる場合の実行を拒否し、最初の会員だけをジャンル管理者にします。通常の会員追加ではこのフラグを指定しません。

## 5. ローカル起動と遊び方

```sh
npm run dev
```

表示されたURLを開き、発行済みの個人コードでログインします。ログインは同じブラウザでログアウトまで維持されます。司会者は自分の問題を登録してルームを作成し、6桁コードか招待URLで回答者2〜7人を集めます。

司会者は待機中にモード、問題数／周回数、時間制限、早押し回答方式、パネル5ジャンルと選択順を設定します。不足条件は開始前に表示し、単独モードの問題不足では問題数を利用可能数まで下げます。

○×・4択は選択後に「回答確定」、パネルは自由記述後に確定します。早押しは司会の受付開始後に押下でき、文字入力は回答権取得者だけが1回送信できます。司会者は進行と判定を操作し、得点は手動で＋10／−10／直接入力します。自動加点はありません。

ゲーム終了→待機へ戻ると同じ部屋で再戦できます。得点はゼロから、使用済みIDは同じ部屋で継続します。確認付きの履歴リセット、途中終了、ルーム閉鎖を用意しています。閉鎖で一時データとコードを削除します。

### PWA

本番URLはHTTPSです。iPhoneはSafariの共有メニューから「ホーム画面に追加」、Androidはブラウザのインストール／ホーム画面追加を使用します。manifest・192/512アイコン・Service Workerを同梱しています。**対戦はオンライン接続が必要です。** Service Workerは同一オリジンのナビゲーションだけをキャッシュし、Firebase応答や回答・問題・得点をキャッシュしません。

## 6. GitHub Pages

1. このフォルダの内容をGitHubリポジトリのルートへ置きます（`node_modules/`、`.env.local`、鍵、ログを含めない）。
2. Settings → Pages → Sourceで **GitHub Actions** を選択します。
3. Settings → Secrets and variables → Actions → **Variables** に次の公開設定を登録します。
   `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_PROJECT_ID`, `VITE_FIREBASE_DATABASE_URL`, `VITE_FIREBASE_APP_ID`。
4. mainブランチへpush、または「GitHub Pages」workflowを手動実行します。

workflowはNode／Javaセットアップ→npm ci→進行テスト→Emulatorテスト→ビルド→Pages公開の順です。認証用サービスアカウントはGitHubに置きません。Viteの相対baseで `https://YOUR_NAME.github.io/REPOSITORY/` に対応します。

公開設定なしでビルドした場合はセットアップ待ち画面になります。Firebase RulesはPagesのworkflowでは変更しません。Rules／インデックスの適用を先に実行してください。

```sh
npm run build
npm run preview
```

## 7. 自動テスト・Emulator

```sh
npm test
npm run test:rules
```

`test:rules`は `demo-uchi-quiz` のAuth・Firestore・RTDB Emulatorだけを起動し、終了時に停止します。実Firebaseのデータに接続しません。Java 21が必要です。初回はEmulator本体をダウンロードします。

手動でローカルのテストデータを使う場合：

```sh
npx firebase emulators:start --project demo-uchi-quiz --only auth,firestore,database
```

別のターミナルで：

```sh
GCLOUD_PROJECT=demo-uchi-quiz \
FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 \
FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 \
FIREBASE_DATABASE_EMULATOR_HOST=127.0.0.1:9000 \
node scripts/seed-emulator.mjs
```

`.env.local`を **検証用** に切り替えます。

```dotenv
VITE_FIREBASE_API_KEY=demo-key
VITE_FIREBASE_AUTH_DOMAIN=demo-uchi-quiz.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=demo-uchi-quiz
VITE_FIREBASE_DATABASE_URL=https://demo-uchi-quiz-default-rtdb.firebaseio.com
VITE_FIREBASE_APP_ID=demo-app
VITE_USE_EMULATORS=true
```

`npm run dev`で起動し、司会 `host123`、回答者 `player1`〜`player7` を別ブラウザプロファイルで使用します。同じプロファイルのタブ間はAuthが共有されるため、別ユーザー検証にはプロファイルを分けてください。seedはローカル接続とdemoプロジェクトを検査し、本番では実行を拒否します。**この検証コードを本番会員に使わないでください。** 本番ビルド前に公開設定へ戻し、`VITE_USE_EMULATORS=false`を確認します。

## 8. 無料枠と実装上の制約

2026-11-14に公式資料を確認しました。

- RTDB Spark：同時接続100、保存1GB、ダウンロード10GB/月。ブラウザタブごとに接続を消費します。上限で新規接続拒否／利用停止となり、無料で無制限には動きません。
- Firestore無料枠：保存1GiB、読取50,000/日、書込20,000/日、削除20,000/日、外向き転送10GiB/月。無料対象は1データベースです。
- 問題一覧は25件ページ、検索は問題文先頭256文字の前方一致。形式・ジャンル・難度は全件対象で絞り込めます。
- 抽選は形式／ジャンル／難度のindexを使い、random pivotから25件ずつ必要数まで読みます。使用履歴が多い／問題不足の場合、候補を走査する読取が増えます。
- ゲーム中はRTDBの必要な子パスのみ購読。残り秒表示は端末内で更新し、ポーリングしません。進行ごとに司会の非公開スナップショットをtransactionで更新するため、大きな問題文や長い履歴ではホストの転送量が増えます。
- 問題文・自由記述の最大4000文字、選択肢1000文字、表示名30文字、ジャンル80文字は保存量とID長の技術的な上限です。
- 切断検出は `onDisconnect` のサーバー検出後で、物理的な通信断と同時ではありません。復帰時は残り時間を計算し直し、司会者が手動再開します。古い接続の切断通知が新しい接続を落とさないようsessionを照合します。
- 全端末が不在の間は締切表示を更新できません。Rulesが期限超過・司会不在・停止中の提出を拒否し、司会復帰後に状態を整合させます。タイマー期限後に復帰した場合、締切済みへ進みます。
- private進行確定とpublic投影は2段階です。投影失敗時は再接続または「進行データの同期を再試行」で復旧します。投影の前でもprivateが締切／停止になればRulesが回答を拒否します。
- 早押しはRTDB transactionがサーバーで確定した順です。端末が押した実時間順の完全な公平性は保証しません。
- ホストの音はWeb Audioを使いますが、端末のミュートやブラウザの自動再生制限に依存します。実機で音の確認が必要です。

公式資料：[料金](https://firebase.google.com/pricing)、[Firestore上限](https://firebase.google.com/docs/firestore/quotas)、[RTDB接続上限](https://firebase.google.com/docs/database/faq-and-troubleshooting)、[presence/onDisconnect](https://firebase.google.com/docs/database/web/offline-capabilities)、[Authパスワード認証](https://firebase.google.com/docs/auth/web/password-auth)、[RTDB Rules](https://firebase.google.com/docs/database/security/core-syntax)、[Firestore Rulesの原子的検証](https://firebase.google.com/docs/firestore/security/rules-conditions)。
