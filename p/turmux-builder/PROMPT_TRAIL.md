# Prompt Trail: Development History

This document details the critical prompt trails used to guide the development and iterative refinement of Turmux Builder.

## 1. Initial Proof of Concept
**Prompt**: "Create a Python script that takes a text description of an application, uses the Gemini API to generate a basic folder structure, and writes those files to a local directory."
**Result**: The foundational file generation system `app_generator.py` and `file_writer.py`.

## 2. GitHub Automation Integration
**Prompt**: "Extend the system. Instead of writing files locally, use PyGithub to create a private repository on my GitHub account and commit all generated files sequentially to this repository. Provide instructions on setting up the necessary PAT."
**Result**: `github_pusher.py` was developed to manage direct API commits to GitHub, establishing the zero-footprint local repository architecture.

## 3. Discord Bot Wrapper
**Prompt**: "Wrap the entire generation pipeline in a Discord Bot using discord.py. I want to type `/build description: <my idea>` and have it reply with a loading embed. Once the GitHub push is successful, update the embed with the repository link and technical summary."
**Result**: Creation of the `discord_bot/bot.py` containing the `/build` slash command and rich status embeds.

## 4. Model Abstraction and Fallbacks
**Prompt**: "Refactor the core logic to abstract the LLM provider. Introduce a `model_manager.py` that can handle requests to both Google Gemini and GitHub Copilot API. If one model hits a rate limit (HTTP 429), automatically fall back to another provider seamlessly."
**Result**: Enabled support for 15+ models, ensuring high availability during generation via the `model_manager.py` abstraction.

## 5. Mobile-First Capabilities
**Prompt**: "Provide a bash script tailored for Android Termux that installs Git, Python, and the required dependencies to run the CLI version of this tool. I want users to clone and run this purely from their phones."
**Result**: Addition of `termux_setup.sh`, allowing robust edge execution.
