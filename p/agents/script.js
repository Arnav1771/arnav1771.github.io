document.addEventListener("DOMContentLoaded", () => {
    const summonBtn = document.getElementById("summon-btn");
    const promptInput = document.getElementById("project-prompt");
    const terminalLog = document.getElementById("terminal-log");
    const specResult = document.getElementById("spec-result");

    const nodeTech = document.getElementById("node-tech");
    const nodeInfra = document.getElementById("node-infra");
    const nodeDeploy = document.getElementById("node-deploy");

    const lineTech = document.getElementById("line-tech");
    const lineInfra = document.getElementById("line-infra");
    const lineDeploy = document.getElementById("line-deploy");

    // Dynamic mock response datasets matching the theme
    const specDatabase = {
        techStack: {
            title: "TECH STACK SPECIFICATION",
            lines: [
                "🧬 [TechStack-Bot] Compiling standard active libraries...",
                "🧬 Language: Python 3.12 (Pydantic models fully enforced)",
                "🧬 Core Web Router: FastAPI (async connections loaded)",
                "🧬 Database Topology: PostgreSQL 16 with pgvector extensions enabled",
                "🧬 Caching: Redis 7.2 Clusters (sub-100ms key execution verified)",
                "🧬 No deprecated libraries included."
            ],
            render: `
                <div class="spec-section">
                    <h3>🧬 TECH STACK (TECHSTACK-BOT)</h3>
                    <ul>
                        <li><strong>Backend</strong>: Python 3.12 + FastAPI (async-first routing)</li>
                        <li><strong>Database</strong>: PostgreSQL 16 + pgvector (for hot long-term semantic stores)</li>
                        <li><strong>Cache</strong>: Redis 7.2 (100% active connections)</li>
                        <li><strong>Auth</strong>: Clerk Authentication + local JWT token hashing</li>
                    </ul>
                </div>
            `
        },
        infra: {
            title: "INFRASTRUCTURE SPECIFICATION",
            lines: [
                "🛡️ [Infra-Bot] Spawning local container definitions...",
                "🛡️ Setting up isolated VPC network layout...",
                "🛡️ Port 8000 (FastAPI API gateway) exposed publicly",
                "🛡️ Port 5432 (PostgreSQL) and Port 6379 (Redis) locked to local bridge",
                "🛡️ Persistent Docker volume attachments configured"
            ],
            render: `
                <div class="spec-section">
                    <h3>🛡️ INFRASTRUCTURE (INFRA-BOT)</h3>
                    <ul>
                        <li><strong>Docker Configuration</strong>: Multi-service containerized orchestration</li>
                        <li><strong>Private Network</strong>: Isolated subnet layers mapping public entryways exclusively</li>
                        <li><strong>Storage Mounts</strong>: Persistent mapped volumes for database reliability</li>
                        <li><strong>Security posture</strong>: Active Row-Level Security (RLS) policies</li>
                    </ul>
                </div>
            `
        },
        deploy: {
            title: "DEPLOYMENT SPECIFICATION",
            lines: [
                "🚀 [Deploy-Bot] Setting up continuous deployment variables...",
                "🚀 CI/CD System: GitHub Actions automation pipeline (lint checks verified)",
                "🚀 Edge Delivery: Vercel App Router static build endpoints",
                "🚀 Container Engine: Railway Docker process scaling metrics initialized",
                "🚀 Monitoring Layer: Sentry error profiling enabled"
            ],
            render: `
                <div class="spec-section">
                    <h3>🚀 DEPLOYMENT (DEPLOY-BOT)</h3>
                    <ul>
                        <li><strong>Continuous Integration</strong>: GitHub Actions running ruff + mypy checks</li>
                        <li><strong>Edge Hosting</strong>: Vercel (Frontend Next.js) and Railway (FastAPI containers)</li>
                        <li><strong>Scale Threshold</strong>: Auto-migration to AWS Fargate ECS if DAUs pass 10,000</li>
                        <li><strong>Observability</strong>: Sentry + Datadog integration</li>
                    </ul>
                </div>
            `
        }
    };

    // Helper to log line by line in terminal with delays
    function appendTerminalLine(text, className = "log-line output-text") {
        const line = document.createElement("div");
        line.className = className;
        line.textContent = text;
        terminalLog.appendChild(line);
        terminalLog.scrollTop = terminalLog.scrollHeight;
    }

    // Trigger Summon Simulation Sequence
    async function triggerSummon() {
        summonBtn.disabled = true;
        summonBtn.textContent = "SWARM COLLABORATING...";
        
        // Reset view
        terminalLog.innerHTML = "";
        specResult.innerHTML = `
            <div class="empty-spec-message pulsing">
                <span class="lock-icon">🔄</span>
                <p>Swarm is processing design metrics... Please hold.</p>
            </div>
        `;
        
        appendTerminalLine("[SYSTEM] Initializing multi-agent workspace...", "log-line system-msg");
        await new Promise(r => setTimeout(r, 800));

        // Step 1: TechStack Bot
        appendTerminalLine("[SYSTEM] Summoning TechStack-Bot [Agent-1]...", "log-line action-msg");
        nodeTech.classList.add("active");
        lineTech.classList.add("active");
        nodeTech.querySelector(".node-status").textContent = "WORKING...";
        await new Promise(r => setTimeout(r, 500));

        for (const line of specDatabase.techStack.lines) {
            appendTerminalLine(line);
            await new Promise(r => setTimeout(r, 400));
        }
        nodeTech.classList.remove("active");
        nodeTech.querySelector(".node-status").textContent = "STANDBY";
        appendTerminalLine("[SYSTEM] TechStack-Bot completed tasks.", "log-line success-msg");
        await new Promise(r => setTimeout(r, 800));

        // Step 2: Infra Bot
        appendTerminalLine("[SYSTEM] Summoning Infra-Bot [Agent-2]...", "log-line action-msg");
        nodeInfra.classList.add("active");
        lineInfra.classList.add("active");
        nodeInfra.querySelector(".node-status").textContent = "WORKING...";
        await new Promise(r => setTimeout(r, 500));

        for (const line of specDatabase.infra.lines) {
            appendTerminalLine(line);
            await new Promise(r => setTimeout(r, 400));
        }
        nodeInfra.classList.remove("active");
        nodeInfra.querySelector(".node-status").textContent = "STANDBY";
        appendTerminalLine("[SYSTEM] Infra-Bot completed tasks.", "log-line success-msg");
        await new Promise(r => setTimeout(r, 800));

        // Step 3: Deploy Bot
        appendTerminalLine("[SYSTEM] Summoning Deploy-Bot [Agent-3]...", "log-line action-msg");
        nodeDeploy.classList.add("active");
        lineDeploy.classList.add("active");
        nodeDeploy.querySelector(".node-status").textContent = "WORKING...";
        await new Promise(r => setTimeout(r, 500));

        for (const line of specDatabase.deploy.lines) {
            appendTerminalLine(line);
            await new Promise(r => setTimeout(r, 400));
        }
        nodeDeploy.classList.remove("active");
        nodeDeploy.querySelector(".node-status").textContent = "STANDBY";
        appendTerminalLine("[SYSTEM] Deploy-Bot completed tasks.", "log-line success-msg");
        await new Promise(r => setTimeout(r, 800));

        // Finalize Compilation
        appendTerminalLine("[SYSTEM] Swarm collaboration sequence ended.", "log-line system-msg");
        appendTerminalLine("[SYSTEM] Compiling unified specs document to C:\\Users\\arnav.STEALTH\\Documents\\Agents\\system_spec.md...", "log-line success-msg");
        await new Promise(r => setTimeout(r, 1000));

        // Render Specifications in UI
        specResult.innerHTML = `
            <div class="spec-rendered">
                ${specDatabase.techStack.render}
                ${specDatabase.infra.render}
                ${specDatabase.deploy.render}
            </div>
        `;

        // Reset lines glow
        lineTech.classList.remove("active");
        lineInfra.classList.remove("active");
        lineDeploy.classList.remove("active");

        summonBtn.disabled = false;
        summonBtn.textContent = "SUMMON SWARM [F5]";
    }

    summonBtn.addEventListener("click", triggerSummon);
});
