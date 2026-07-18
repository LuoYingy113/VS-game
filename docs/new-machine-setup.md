# Team Matcher New Mac Setup

This document lists the environment and installation steps needed to run this project on a new macOS computer.

## 1. Required Software (Frontend)

For Expo frontend development, install:

1. Git
2. Node.js 22 (recommended to match this project)
3. npm (comes with Node)
4. Watchman (recommended by React Native/Expo on macOS)
5. Xcode Command Line Tools (for iOS-related tooling)

Install command examples:

```bash
# Install Homebrew first if missing: https://brew.sh
brew install git nvm watchman

# Enable nvm (add to ~/.zshrc if needed)
export NVM_DIR="$HOME/.nvm"
[ -s "$(brew --prefix nvm)/nvm.sh" ] && . "$(brew --prefix nvm)/nvm.sh"

# Install and use Node 22
nvm install 22
nvm use 22
node -v
npm -v

# Install Xcode command line tools
xcode-select --install
```

## 2. Project Install (Frontend)

```bash
git clone <your-repo-url>
cd team-matcher-app
nvm use 22
npm install
```

Start app:

```bash
npx expo start --tunnel --clear --go
```

Notes:

1. `--go` is for Expo Go.
2. `--tunnel` is useful when local network conditions are restrictive.
3. You can also use `npm run ios`, `npm run android`, `npm run web`.

## 3. If You Need EAS Build/Submit

This repository has `eas.json`, so install and login to EAS:

```bash
npm install -g eas-cli
eas login
eas whoami
```

For iOS build/submit, you also need:

1. Apple Developer account
2. App Store Connect permissions
3. Correct bundle identifier and credentials configured in Expo/EAS

Common commands:

```bash
eas build -p ios --profile production
eas submit -p ios
```

## 4. Optional: Local Backend (Python)

The repository includes `main.py` (FastAPI backend entry). If you need to run backend locally, install Python 3.11+ and these packages:

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install fastapi uvicorn sqlalchemy pydantic
```

Then run (typical FastAPI command):

```bash
uvicorn main:app --reload
```

Important:

1. Current repository does not include a dependency lock file like `requirements.txt`.
2. `main.py` imports local modules such as `database` and `models`; make sure those files exist in your backend source before running.
3. If backend is deployed remotely and app only calls API endpoints, local Python setup can be skipped.

## 5. Quick Verification Checklist

Run these checks on the new machine:

```bash
git --version
node -v
npm -v
npx expo --version
eas --version
```

If all pass, run:

```bash
npm install
npx expo start --tunnel --clear --go
```
