# Technical Specification: Turmux Builder

## Overview
Turmux Builder is an advanced NLP-to-App Generation System that allows developers and users to build fully functional web and mobile applications from plain English descriptions. The system leverages state-of-the-art AI models (Google Gemini and GitHub Copilot models) to architect, generate, and deploy applications instantly to a private GitHub repository.

## Architecture
The system operates on a 3-pass intelligent pipeline to guarantee robustness:
1. **Planning Pass**: The AI model analyzes the NLP prompt and architects the complete system, outputting a precise file manifest and structure.
2. **Generation Pass**: The model iteratively generates the content for each file (source code, Dockerfile, scripts, etc.), ensuring compatibility across the stack.
3. **Validation & Fix Pass**: A final review corrects missing imports, patches potential security issues, and updates deprecated libraries before the code is finalized.

### Core Modules
- `core/app_generator.py`: The heart of the NLP parsing and file generation sequence. Supports multiple LLM providers.
- `core/model_manager.py`: Abstraction layer managing provider fallback and token usage across 15+ models (Gemini, Claude, GPT, Llama).
- `core/github_pusher.py`: Handles seamless pushing to GitHub via the GitHub Contents API, creating a new private repository dynamically.
- `discord_bot/bot.py`: The Discord integration layer allowing users to trigger builds using the `/build` slash command.
- `cli/build.py`: Terminal/Termux CLI interface for mobile-first and desktop developers.

## Interfaces
- **Discord Bot**: A slash-command bot that offers real-time status updates via rich embeds.
- **Termux CLI**: Optimized for Android mobile devices, enabling full-stack app generation without a laptop.
- **Local Python CLI**: Standard terminal usage via `python cli/build.py`.

## Data Flow
1. User submits a prompt (e.g., "React frontend with FastAPI backend").
2. `app_generator.py` dispatches the prompt to the selected LLM provider via `model_manager.py`.
3. The LLM returns a structured JSON payload detailing the AppBundle.
4. `github_pusher.py` receives the AppBundle, connects to GitHub using the `GITHUB_TOKEN`, creates a private repository, and sequentially uploads all generated files.
5. A live link to the GitHub repository is returned to the original interface.

## Security
- API Keys (`GEMINI_API_KEY`, `GITHUB_TOKEN`, `DISCORD_BOT_TOKEN`) are explicitly managed via `.env` files and never tracked by Git.
- All dynamically generated repositories are created as **Private** to ensure source code confidentiality.
- The 3-pass generation explicitly checks for hardcoded secrets and vulnerable dependency versions.
