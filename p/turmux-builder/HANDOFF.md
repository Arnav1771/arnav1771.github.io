# Turmux Builder — Handoff Documentation

## Repository Details
- **Project Name**: Turmux Builder
- **Description**: An AI-driven NLP-to-App tool that automatically constructs complete software repositories based on natural language descriptions and pushes them directly to GitHub.
- **Technologies Used**: Python 3.11, PyGithub, Discord.py, Google Gemini API, GitHub Copilot API.

## Setup Instructions
To get started with development or deployment, ensure you have Python 3.11+ installed.

1. **Clone the Project**:
   ```bash
   git clone https://github.com/Arnav1771/turmux_builder.git
   cd turmux_builder
   ```

2. **Install Dependencies**:
   ```bash
   pip install -r requirements.txt
   ```

3. **Configure Environment Variables**:
   Copy `.env.example` to `.env` and fill in the required keys:
   - `GEMINI_API_KEY`: Sourced from Google AI Studio.
   - `GITHUB_TOKEN`: A Personal Access Token (PAT) with `repo` scope.
   - `GITHUB_USERNAME`: Your GitHub username.
   - `DISCORD_BOT_TOKEN`: The Bot Token from Discord Developer Portal.

## How to Run

### Local CLI
Run the application locally via the command line:
```bash
python cli/build.py "Simple React counter application"
```

### Discord Bot
Launch the Discord Bot listener:
```bash
python discord_bot/bot.py
```
*In Discord, utilize the `/build` slash command to initiate generation.*

### Termux (Mobile)
A one-shot script is provided for Android Termux users:
```bash
bash termux_setup.sh
```

## Known Limitations & Future Work
- Complex multi-repository microservices might require additional prompt tuning or fail during the 3-pass compilation.
- Currently, the Vercel auto-deployment workflow is experimental and may require manual tweaks in the output `.env` configurations.
- Upcoming features involve direct deployment via Fly.io templates.
