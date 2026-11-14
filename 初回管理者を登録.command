#!/bin/zsh
cd "$(dirname "$0")" || exit 1
export PATH="/usr/local/bin:/opt/homebrew/bin:$PATH"
export GCLOUD_PROJECT='uchi-quiz-ten10626-261114'
export FIREBASE_DATABASE_URL='https://uchi-quiz-ten10626-261114-default-rtdb.asia-southeast1.firebasedatabase.app'
export QUIZ_USE_FIREBASE_LOGIN=true
export QUIZ_INITIAL_ADMIN=true
printf 'うちクイズ：初回管理者の登録\n個人コードは画面に表示されません。6文字以上の半角英数字を決めてください。\n'
if [[ ! -d node_modules ]]; then npm ci || exit 1; fi
npm run admin -- add
printf '\nEnterキーで閉じます。'
read
