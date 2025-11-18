#!/bin/bash

set -e

echo "🚀 Claude Wrapper Installation"
echo "================================"
echo ""

# Find the Claude CLI binary
CLAUDE_PATH=$(which claude 2>/dev/null || echo "")

if [ -z "$CLAUDE_PATH" ]; then
  echo "❌ Error: Claude CLI not found in PATH"
  echo "Please install the official Claude CLI first:"
  echo "  https://docs.anthropic.com/claude/docs/cli"
  exit 1
fi

echo "✓ Found Claude CLI at: $CLAUDE_PATH"

# Check if already renamed
if [ -f "${CLAUDE_PATH}-original" ]; then
  echo "⚠️  Warning: ${CLAUDE_PATH}-original already exists"
  echo "It looks like the wrapper is already installed."
  read -p "Do you want to reinstall? (y/N) " -n 1 -r
  echo
  if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "Installation cancelled"
    exit 0
  fi
else
  # Rename original claude binary
  echo "📦 Renaming original Claude CLI to claude-original..."
  sudo mv "$CLAUDE_PATH" "${CLAUDE_PATH}-original"
  echo "✓ Renamed $CLAUDE_PATH to ${CLAUDE_PATH}-original"
fi

# Build the wrapper
echo "🔨 Building wrapper..."
npm run build

# Link the wrapper
echo "🔗 Installing wrapper..."
sudo npm link

# Create symlink for claude command
echo "🔗 Creating claude symlink..."
CLAUDE_WRAPPER_PATH=$(which claude-wrapper)
sudo ln -sf "$CLAUDE_WRAPPER_PATH" "$CLAUDE_PATH"

# Create config directory
echo "📁 Creating configuration directory..."
mkdir -p ~/.claude-wrapper/tokens
mkdir -p ~/.claude-wrapper/backups
chmod 700 ~/.claude-wrapper
chmod 700 ~/.claude-wrapper/tokens

# Copy example config
if [ ! -f ~/.claude-wrapper.yml ]; then
  echo "📝 Creating default configuration..."
  cp .claude-wrapper.example.yml ~/.claude-wrapper.yml
  # Update claudePath in config
  sed -i "s|/usr/local/bin/claude-original|${CLAUDE_PATH}-original|g" ~/.claude-wrapper.yml
  echo "✓ Created ~/.claude-wrapper.yml"
else
  echo "⚠️  Config file ~/.claude-wrapper.yml already exists, skipping"
fi

echo ""
echo "✅ Installation complete!"
echo ""
echo "Next steps:"
echo "1. Authenticate with Claude CLI (this will use the original binary):"
echo "   ${CLAUDE_PATH}-original auth login"
echo ""
echo "2. Create a profile:"
echo "   claude wrapper profile create default --email your@email.com"
echo ""
echo "3. Switch to the profile:"
echo "   claude wrapper profile switch default"
echo ""
echo "4. Copy your existing token to the wrapper (if you have one):"
echo "   # Find your existing token file location and copy it to:"
echo "   # ~/.claude-wrapper/tokens/default.token.json"
echo ""
echo "5. Test the wrapper:"
echo "   claude --version"
echo ""
echo "For more information, see README.md"
