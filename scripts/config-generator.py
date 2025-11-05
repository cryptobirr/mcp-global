#!/usr/bin/env python3
"""
MCP Global Configuration Generator
=================================

Generates tool-specific configurations for centralized MCP servers.
Supports multiple LLM tools and configuration formats.

Usage:
    python3 config-generator.py --tool claude-desktop --profile default
    python3 config-generator.py --tool cursor --profile development --output config.json

Supported Tools:
    - claude-desktop: Claude Desktop app
    - claude-code: Claude Code (same format as desktop)
    - cursor: Cursor IDE
    - windsurf: Windsurf IDE
    - continue: Continue.dev extension
    - cline: Cline VS Code extension
    - zed: Zed editor

Author: MCP Global Migration System
Version: 1.0.0
"""

import json
import os
import sys
import argparse
from pathlib import Path
from typing import Dict, List, Optional, Any, Union


class ConfigGenerator:
    """Configuration generator for MCP Global servers."""

    def __init__(self):
        """Initialize the configuration generator."""
        self.mcp_dir = Path.home() / ".mcp-global"
        self.registry_path = self.mcp_dir / "registry" / "global-registry.json"
        self.credentials_path = self.mcp_dir / "shared" / "credentials" / "extracted_credentials.json"

        # Load registry and credentials
        self.registry = self._load_registry()
        self.credentials = self._load_credentials()

        # Tool configuration templates
        self.tool_configs = {
            'claude-desktop': {
                'config_path': '~/Library/Application Support/Claude/claude_desktop_config.json',
                'format': 'claude',
                'root_key': 'mcpServers'
            },
            'claude-code': {
                'config_path': '~/.config/claude-code/mcp_servers.json',
                'format': 'claude',
                'root_key': 'mcpServers'
            },
            'cursor': {
                'config_path': 'mcp.json',
                'format': 'cursor',
                'root_key': 'mcpServers'
            },
            'windsurf': {
                'config_path': 'mcp.json',
                'format': 'cursor',
                'root_key': 'mcpServers'
            },
            'continue': {
                'config_path': 'config.json',
                'format': 'continue',
                'root_key': 'mcpServers'
            },
            'cline': {
                'config_path': 'settings.json',
                'format': 'vscode',
                'root_key': 'cline.mcpServers'
            },
            'zed': {
                'config_path': 'settings.json',
                'format': 'zed',
                'root_key': 'mcpServers'
            }
        }

    def _load_registry(self) -> Dict[str, Any]:
        """Load the global server registry."""
        try:
            with open(self.registry_path, 'r') as f:
                return json.load(f)
        except FileNotFoundError:
            print(f"❌ Registry not found: {self.registry_path}")
            sys.exit(1)
        except json.JSONDecodeError as e:
            print(f"❌ Invalid registry JSON: {e}")
            sys.exit(1)

    def _load_credentials(self) -> Dict[str, Any]:
        """Load extracted credentials."""
        try:
            with open(self.credentials_path, 'r') as f:
                return json.load(f)
        except FileNotFoundError:
            return {}
        except json.JSONDecodeError:
            return {}

    def get_servers_for_profile(self, profile: str) -> List[str]:
        """Get list of servers for a given profile."""
        profiles = self.registry.get('profiles', {})

        if profile not in profiles:
            print(f"❌ Profile '{profile}' not found. Available profiles: {list(profiles.keys())}")
            return []

        server_list = profiles[profile]

        # If empty, include all servers
        if not server_list:
            server_list = list(self.registry.get('servers', {}).keys())

        return server_list

    def substitute_credentials(self, config: Dict[str, Any]) -> Dict[str, Any]:
        """Replace credential placeholders with actual values."""
        config_str = json.dumps(config)

        # Replace credential placeholders
        for cred_name, cred_value in self.credentials.items():
            placeholder = f"{{{{{cred_name}}}}}"
            if placeholder in config_str:
                config_str = config_str.replace(placeholder, str(cred_value))

        return json.loads(config_str)

    def generate_claude_config(self, servers: List[str]) -> Dict[str, Any]:
        """Generate Claude Desktop/Code format configuration."""
        config = {}

        for server_id in servers:
            server_info = self.registry.get('servers', {}).get(server_id, {})
            if not server_info:
                continue

            server_type = server_info.get('type', 'unknown')

            if server_type == 'npm':
                # NPM-based servers
                package = server_info.get('package', '')
                command = server_info.get('command', 'npx')
                args = server_info.get('args', [])

                server_config = {
                    'command': command,
                    'args': args.copy()
                }

                # Add default arguments for filesystem server
                if server_id == 'filesystem':
                    default_paths = ['/Users/mekonen/Desktop', '/Users/mekonen/Downloads']
                    server_config['args'].extend(default_paths)

            elif server_type in ['nodejs', 'python']:
                # Local servers
                main_file = server_info.get('main_file', '')
                if not main_file:
                    continue

                # Convert to full path
                main_file_path = main_file.replace('~/.mcp-global', str(self.mcp_dir))

                if server_type == 'nodejs':
                    server_config = {
                        'command': 'node',
                        'args': [main_file_path]
                    }
                else:  # python
                    server_config = {
                        'command': 'python3',
                        'args': [main_file_path]
                    }

                # Add environment variables
                env_vars = server_info.get('requires_env', [])
                if env_vars:
                    env_config = {}
                    for var_name in env_vars:
                        # Use placeholder that will be substituted
                        if var_name in self.credentials:
                            env_config[var_name] = f"{{{{{var_name}}}}}"
                        else:
                            # Leave as placeholder for manual substitution
                            env_config[var_name] = f"{{SET_{var_name}_HERE}}"

                    if env_config:
                        server_config['env'] = env_config

            else:
                continue

            config[server_id] = server_config

        return {'mcpServers': config}

    def generate_cursor_config(self, servers: List[str]) -> Dict[str, Any]:
        """Generate Cursor/Windsurf format configuration."""
        # Get base Claude config
        claude_config = self.generate_claude_config(servers)

        # Convert to Cursor format (add type: stdio to each server)
        cursor_config = {}
        for server_id, server_info in claude_config.get('mcpServers', {}).items():
            cursor_server = server_info.copy()
            cursor_server['type'] = 'stdio'
            cursor_config[server_id] = cursor_server

        return {'mcpServers': cursor_config}

    def generate_continue_config(self, servers: List[str]) -> Dict[str, Any]:
        """Generate Continue.dev format configuration."""
        # Base Continue.dev configuration
        base_config = {
            "models": [
                {
                    "title": "Claude 3.5 Sonnet",
                    "provider": "anthropic",
                    "model": "claude-3-5-sonnet-20241022",
                    "apiKey": "{{ANTHROPIC_API_KEY}}"
                }
            ],
            "customCommands": [],
            "tabAutocompleteModel": {
                "title": "Claude 3.5 Sonnet",
                "provider": "anthropic",
                "model": "claude-3-5-sonnet-20241022"
            }
        }

        # Add MCP servers in Claude format
        claude_config = self.generate_claude_config(servers)
        base_config.update(claude_config)

        return base_config

    def generate_vscode_config(self, servers: List[str]) -> Dict[str, Any]:
        """Generate VS Code/Cline format configuration."""
        # Get base Claude config
        claude_config = self.generate_claude_config(servers)

        # Wrap in cline namespace
        return {
            'cline.mcpServers': claude_config.get('mcpServers', {})
        }

    def generate_zed_config(self, servers: List[str]) -> Dict[str, Any]:
        """Generate Zed editor format configuration."""
        # Zed uses similar format to Claude
        claude_config = self.generate_claude_config(servers)

        # Add Zed-specific assistant configuration
        zed_config = {
            "assistant": {
                "default_model": {
                    "provider": "anthropic",
                    "model": "claude-3-5-sonnet-20241022"
                },
                "version": "2"
            }
        }

        # Merge MCP servers
        zed_config.update(claude_config)

        return zed_config

    def generate_config(self, tool: str, profile: str = 'default',
                       substitute_creds: bool = True) -> Dict[str, Any]:
        """Generate configuration for specified tool and profile."""
        if tool not in self.tool_configs:
            raise ValueError(f"Unsupported tool: {tool}. Supported: {list(self.tool_configs.keys())}")

        # Get servers for profile
        servers = self.get_servers_for_profile(profile)
        if not servers:
            return {}

        # Generate config based on tool format
        tool_info = self.tool_configs[tool]
        format_type = tool_info['format']

        if format_type == 'claude':
            config = self.generate_claude_config(servers)
        elif format_type == 'cursor':
            config = self.generate_cursor_config(servers)
        elif format_type == 'continue':
            config = self.generate_continue_config(servers)
        elif format_type == 'vscode':
            config = self.generate_vscode_config(servers)
        elif format_type == 'zed':
            config = self.generate_zed_config(servers)
        else:
            raise ValueError(f"Unknown format type: {format_type}")

        # Substitute credentials if requested
        if substitute_creds:
            config = self.substitute_credentials(config)

        return config

    def list_profiles(self) -> Dict[str, List[str]]:
        """List all available profiles and their servers."""
        return self.registry.get('profiles', {})

    def list_servers(self) -> Dict[str, Dict[str, Any]]:
        """List all available servers."""
        return self.registry.get('servers', {})

    def validate_config(self, config: Dict[str, Any], tool: str) -> List[str]:
        """Validate generated configuration."""
        issues = []

        mcp_servers = config.get('mcpServers', {})
        if tool == 'cline':
            mcp_servers = config.get('cline.mcpServers', {})

        if not mcp_servers:
            issues.append("No MCP servers found in configuration")
            return issues

        for server_id, server_config in mcp_servers.items():
            # Check required fields
            if 'command' not in server_config:
                issues.append(f"Server '{server_id}' missing 'command' field")

            if 'args' not in server_config:
                issues.append(f"Server '{server_id}' missing 'args' field")

            # Check for unsubstituted placeholders
            config_str = json.dumps(server_config)
            if '{{SET_' in config_str:
                issues.append(f"Server '{server_id}' has unsubstituted environment variables")

        return issues


def main():
    """Main CLI interface."""
    parser = argparse.ArgumentParser(description='MCP Global Configuration Generator')
    parser.add_argument('--tool', '-t', required=True,
                       choices=['claude-desktop', 'claude-code', 'cursor', 'windsurf',
                               'continue', 'cline', 'zed'],
                       help='Target tool for configuration')
    parser.add_argument('--profile', '-p', default='default',
                       help='Server profile to use (default: default)')
    parser.add_argument('--output', '-o', help='Output file path (default: stdout)')
    parser.add_argument('--no-substitute', action='store_true',
                       help='Don\'t substitute credential placeholders')
    parser.add_argument('--validate', action='store_true',
                       help='Validate the generated configuration')
    parser.add_argument('--list-profiles', action='store_true',
                       help='List available profiles')
    parser.add_argument('--list-servers', action='store_true',
                       help='List available servers')

    args = parser.parse_args()

    generator = ConfigGenerator()

    if args.list_profiles:
        profiles = generator.list_profiles()
        print("Available Profiles:")
        print("=" * 30)
        for profile_name, servers in profiles.items():
            print(f"\n📋 {profile_name}:")
            if servers:
                for server in servers:
                    print(f"  - {server}")
            else:
                print("  - (all servers)")
        return

    if args.list_servers:
        servers = generator.list_servers()
        print("Available Servers:")
        print("=" * 30)

        by_category = {}
        for server_id, server_info in servers.items():
            category = server_info.get('category', 'uncategorized')
            if category not in by_category:
                by_category[category] = []
            by_category[category].append((server_id, server_info))

        for category, server_list in sorted(by_category.items()):
            print(f"\n📁 {category.upper()}:")
            for server_id, server_info in server_list:
                server_type = server_info.get('type', 'unknown')
                print(f"  - {server_id} ({server_type})")
        return

    try:
        # Generate configuration
        config = generator.generate_config(
            tool=args.tool,
            profile=args.profile,
            substitute_creds=not args.no_substitute
        )

        # Validate if requested
        if args.validate:
            issues = generator.validate_config(config, args.tool)
            if issues:
                print("❌ Configuration validation failed:", file=sys.stderr)
                for issue in issues:
                    print(f"  - {issue}", file=sys.stderr)
                sys.exit(1)
            else:
                print("✅ Configuration validation passed", file=sys.stderr)

        # Output configuration
        config_json = json.dumps(config, indent=2)

        if args.output:
            output_path = Path(args.output).expanduser()
            output_path.parent.mkdir(parents=True, exist_ok=True)
            with open(output_path, 'w') as f:
                f.write(config_json)
            print(f"✅ Configuration written to: {output_path}")
        else:
            print(config_json)

    except Exception as e:
        print(f"❌ Error generating configuration: {e}", file=sys.stderr)
        sys.exit(1)


if __name__ == '__main__':
    main()