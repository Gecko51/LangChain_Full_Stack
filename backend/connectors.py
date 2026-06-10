"""Curated catalog of MCP connectors for one-click setup.

Each entry is a template the UI turns into "Connect <Tool>" cards: the user fills the
``inputs`` (credentials or args) and we build an ``MCPServer`` from ``base_args`` +
those inputs. No secrets live here — only the shape of what to ask for + help links.

Note: the credential-free servers (filesystem / memory / sequential-thinking) are the
maintained reference servers and connect instantly. The business connectors are
third-party templates — the ``help_url`` points to where to get the token / verify
the current package, since the MCP ecosystem moves fast.

Input ``kind``:
  - "env"    -> set as an environment variable (stdio servers)
  - "header" -> sent as a request header (sse/http servers)
  - "arg"    -> appended to the command args (e.g. a path or connection string)
"""
from __future__ import annotations

CONNECTOR_CATALOG: list[dict] = [
    {
        "id": "filesystem",
        "label": "Filesystem",
        "category": "Local",
        "description": "Read & write files in a folder you choose.",
        "transport": "stdio",
        "command": "npx",
        "base_args": ["-y", "@modelcontextprotocol/server-filesystem"],
        "url": None,
        "inputs": [
            {"key": "path", "label": "Folder to expose", "kind": "arg", "default": "."},
        ],
        "help_url": "https://github.com/modelcontextprotocol/servers/tree/main/src/filesystem",
    },
    {
        "id": "memory",
        "label": "Memory",
        "category": "Local",
        "description": "A knowledge graph the agent can store & recall facts in.",
        "transport": "stdio",
        "command": "npx",
        "base_args": ["-y", "@modelcontextprotocol/server-memory"],
        "url": None,
        "inputs": [],
        "help_url": "https://github.com/modelcontextprotocol/servers/tree/main/src/memory",
    },
    {
        "id": "sequential-thinking",
        "label": "Sequential Thinking",
        "category": "Reasoning",
        "description": "Structured step-by-step reasoning scaffold for hard problems.",
        "transport": "stdio",
        "command": "npx",
        "base_args": ["-y", "@modelcontextprotocol/server-sequential-thinking"],
        "url": None,
        "inputs": [],
        "help_url": "https://github.com/modelcontextprotocol/servers/tree/main/src/sequentialthinking",
    },
    {
        "id": "github",
        "label": "GitHub",
        "category": "Dev",
        "description": "Search repos, read & open issues and pull requests.",
        "transport": "stdio",
        "command": "npx",
        "base_args": ["-y", "@modelcontextprotocol/server-github"],
        "url": None,
        "inputs": [
            {
                "key": "GITHUB_PERSONAL_ACCESS_TOKEN",
                "label": "Personal Access Token",
                "kind": "env",
                "secret": True,
                "help_url": "https://github.com/settings/personal-access-tokens",
            },
        ],
        "help_url": "https://github.com/github/github-mcp-server",
    },
    {
        "id": "notion",
        "label": "Notion",
        "category": "Productivity",
        "description": "Search and edit your Notion pages & databases.",
        "transport": "stdio",
        "command": "npx",
        "base_args": ["-y", "@notionhq/notion-mcp-server"],
        "url": None,
        "inputs": [
            {
                "key": "NOTION_TOKEN",
                "label": "Internal Integration Token",
                "kind": "env",
                "secret": True,
                "help_url": "https://www.notion.so/my-integrations",
            },
        ],
        "help_url": "https://github.com/makenotion/notion-mcp-server",
    },
    {
        "id": "slack",
        "label": "Slack",
        "category": "Communication",
        "description": "Read channels and post messages as a Slack bot.",
        "transport": "stdio",
        "command": "npx",
        "base_args": ["-y", "@modelcontextprotocol/server-slack"],
        "url": None,
        "inputs": [
            {
                "key": "SLACK_BOT_TOKEN",
                "label": "Bot User OAuth Token (xoxb-…)",
                "kind": "env",
                "secret": True,
                "help_url": "https://api.slack.com/apps",
            },
            {
                "key": "SLACK_TEAM_ID",
                "label": "Team / Workspace ID (T…)",
                "kind": "env",
                "secret": False,
                "help_url": "https://api.slack.com/apps",
            },
        ],
        "help_url": "https://github.com/modelcontextprotocol/servers-archived/tree/main/src/slack",
    },
    {
        "id": "brave-search",
        "label": "Brave Search",
        "category": "Search",
        "description": "Web & local search via the Brave Search API.",
        "transport": "stdio",
        "command": "npx",
        "base_args": ["-y", "@modelcontextprotocol/server-brave-search"],
        "url": None,
        "inputs": [
            {
                "key": "BRAVE_API_KEY",
                "label": "Brave Search API key",
                "kind": "env",
                "secret": True,
                "help_url": "https://brave.com/search/api/",
            },
        ],
        "help_url": "https://github.com/modelcontextprotocol/servers-archived/tree/main/src/brave-search",
    },
]
