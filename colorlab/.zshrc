export PATH="/opt/homebrew/opt/ruby/bin:$PATH"
eval "$(rbenv init - zsh)"
PROMPT="🔥 %n %1~ %# "
# .zshrc


export NVM_DIR="$HOME/.nvm"
alias colorlab='cd /Users/studio/Projects/colorlab && npm run start:local'export NVM_DIR="$HOME/.nvm"

# Load nvm installed through Homebrew
[ -s "/opt/homebrew/opt/nvm/nvm.sh" ] && \. "/opt/homebrew/opt/nvm/nvm.sh"
[ -s "/opt/homebrew/opt/nvm/etc/bash_completion.d/nvm" ] && \. "/opt/homebrew/opt/nvm/etc/bash_completion.d/nvm"

# Local user scripts
export PATH="$HOME/.local/bin:$PATH"

# Project launchers
alias colorlab='cd /Users/studio/Projects/colorlab && npm run start:local'
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"  # This loads nvm
[ -s "$NVM_DIR/bash_completion" ] && \. "$NVM_DIR/bash_completion"  # This loads nvm bash_completion
export NVM_DIR="$HOME/.nvm"
[ -s "/opt/homebrew/opt/nvm/nvm.sh" ] && \. "/opt/homebrew/opt/nvm/nvm.sh"
export PATH="$HOME/.local/bin:$PATH"
