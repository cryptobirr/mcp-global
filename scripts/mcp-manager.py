#!/usr/bin/env python3
"""
Global MCP Manager
Centralized management for all MCP servers across tools
"""

import json
import os
import sys
import argparse
import subprocess
import time
from pathlib import Path
from typing import Dict, List, Any, Optional

class MCPGlobalManager:
    def __init__(self):
        self.mcp_dir = Path.home() / ".mcp-global"
        self.registry_path = self.mcp_dir / "registry" / "global-registry.json"
        self.credentials_path = self.mcp_dir / "shared" / "credentials" / "extracted_credentials.json"
        self.registry = self.load_registry()
        self.credentials = self.load_credentials()

    def load_registry(self) -> Dict[str, Any]:
        """Load the global MCP registry"""
        try:
            with open(self.registry_path, 'r') as f:
                return json.load(f)
        except FileNotFoundError:
            print(f"❌ Registry file not found: {self.registry_path}")
            print("Please ensure Phase 3 (Server Migration) has been completed.")
            sys.exit(1)
        except json.JSONDecodeError as e:
            print(f"❌ Invalid JSON in registry: {e}")
            sys.exit(1)

    def load_credentials(self) -> Dict[str, str]:
        """Load extracted credentials"""
        try:
            with open(self.credentials_path, 'r') as f:
                return json.load(f)
        except FileNotFoundError:
            print("⚠️  No credentials file found. Some servers may not work without environment variables.")
            return {}
        except json.JSONDecodeError:
            print("⚠️  Invalid credentials file format.")
            return {}

    def list_servers(self, category: Optional[str] = None, status_filter: Optional[str] = None) -> None:
        """List all available servers"""
        print("🌟 Global MCP Servers")
        print("=" * 50)

        servers = self.registry.get("servers", {})

        # Filter by category if specified
        if category:
            servers = {k: v for k, v in servers.items()
                      if v.get("category", "uncategorized") == category}

        if not servers:
            if category:
                print(f"No servers found in category: {category}")
            else:
                print("No servers found in registry")
            return

        # Group by category
        categories = {}
        for server_id, server in servers.items():
            cat = server.get("category", "uncategorized")
            if cat not in categories:
                categories[cat] = []
            categories[cat].append((server_id, server))

        total_servers = 0
        for category, server_list in sorted(categories.items()):
            print(f"\n📁 {category.upper()}")
            print("-" * 30)

            for server_id, server in sorted(server_list):
                # Determine server type and icon
                server_type = server.get("type", "unknown")
                if server_type == "npm":
                    icon = "📦"
                elif server_type == "nodejs":
                    icon = "🏗️"
                elif server_type == "python":
                    icon = "🐍"
                else:
                    icon = "❓"

                # Check if server is available
                status_icon = self._get_server_status_icon(server_id, server)

                print(f"{status_icon} {icon} {server_id}")
                print(f"   Name: {server.get('name', server_id)}")
                print(f"   Type: {server_type}")

                if "requires_env" in server and server["requires_env"]:
                    env_status = self._check_env_vars(server["requires_env"])
                    print(f"   Environment: {env_status}")

                if server_type == "npm" and "package" in server:
                    print(f"   Package: {server['package']}")
                elif "main_file" in server and server["main_file"]:
                    print(f"   Main: {server['main_file']}")

                print()
                total_servers += 1

        print(f"📊 Total: {total_servers} servers")

        # Show available categories
        all_categories = list(categories.keys())
        if len(all_categories) > 1:
            print(f"📂 Categories: {', '.join(sorted(all_categories))}")

        # Show available profiles
        profiles = self.registry.get("profiles", {})
        if profiles:
            print(f"👥 Profiles: {', '.join(profiles.keys())}")

    def _get_server_status_icon(self, server_id: str, server: Dict[str, Any]) -> str:
        """Get status icon for a server"""
        server_type = server.get("type", "unknown")

        if server_type == "npm":
            return "✅"  # NPM servers are assumed available

        # Check if local server has build output
        if server.get("built", False):
            return "✅"
        elif server_type == "python":
            return "🐍"  # Python servers may not need building
        else:
            return "⚠️"   # Needs building or verification

    def _check_env_vars(self, required_env: List[str]) -> str:
        """Check if required environment variables are available"""
        available = 0
        for env_var in required_env:
            if env_var in self.credentials or env_var in os.environ:
                available += 1

        if available == len(required_env):
            return f"✅ {available}/{len(required_env)} available"
        elif available > 0:
            return f"⚠️  {available}/{len(required_env)} available"
        else:
            return f"❌ {available}/{len(required_env)} available"

    def list_profiles(self) -> None:
        """List all available server profiles"""
        print("👥 Server Profiles")
        print("=" * 50)

        profiles = self.registry.get("profiles", {})
        if not profiles:
            print("No profiles defined")
            return

        for profile_name, server_list in profiles.items():
            print(f"\n🏷️  {profile_name}")
            print(f"   Servers ({len(server_list)}): {', '.join(server_list)}")

            # Show which servers actually exist
            existing = [s for s in server_list if s in self.registry.get("servers", {})]
            missing = [s for s in server_list if s not in self.registry.get("servers", {})]

            if existing:
                print(f"   Available: {', '.join(existing)}")
            if missing:
                print(f"   Missing: {', '.join(missing)}")

    def generate_config(self, tool: str, profile: str = "default", servers: List[str] = None,
                       output_file: Optional[str] = None) -> str:
        """Generate configuration for a specific tool"""
        if tool not in self.registry.get("tools", {}):
            available_tools = list(self.registry.get("tools", {}).keys())
            raise ValueError(f"Tool '{tool}' not supported. Available: {', '.join(available_tools)}")

        # Determine which servers to include
        if servers:
            server_list = servers
        elif profile in self.registry.get("profiles", {}):
            server_list = self.registry["profiles"][profile]
        else:
            available_profiles = list(self.registry.get("profiles", {}).keys())
            raise ValueError(f"Profile '{profile}' not found. Available: {', '.join(available_profiles)}")

        # Generate configuration based on tool format
        tool_info = self.registry["tools"][tool]
        config_format = tool_info["format"]

        if config_format == "claude-desktop" or config_format == "claude-code":
            config = self._generate_claude_config(server_list)
        elif config_format == "cursor":
            config = self._generate_cursor_config(server_list)
        elif config_format == "continue":
            config = self._generate_continue_config(server_list)
        elif config_format == "vscode":
            config = self._generate_vscode_config(server_list)
        elif config_format == "zed":
            config = self._generate_zed_config(server_list)
        else:
            raise ValueError(f"Unsupported config format: {config_format}")

        # Save to file if requested
        if output_file:
            with open(output_file, 'w') as f:
                json.dump(config, f, indent=2)
            print(f"✅ Configuration saved to: {output_file}")

        return json.dumps(config, indent=2)

    def _substitute_credentials(self, value: str) -> str:
        """Substitute credential placeholders with actual values"""
        if not isinstance(value, str):
            return value

        for key, cred_value in self.credentials.items():
            placeholder = f"{{{{{key}}}}}"
            if placeholder in value:
                value = value.replace(placeholder, cred_value)
        return value

    def _build_server_config(self, server_id: str, format_type: str) -> Dict[str, Any]:
        """Build server configuration for specific format"""
        if server_id not in self.registry.get("servers", {}):
            print(f"⚠️  Server '{server_id}' not found in registry")
            return {}

        server = self.registry["servers"][server_id]

        if server.get("type") == "npm":
            command = server.get("command", "npx")
            args = server.get("args", [])
        else:  # local-build
            command = "node"  # Default for nodejs servers
            main_file = server.get("main_file", "")
            if main_file:
                # Expand ~ to home directory
                main_file = main_file.replace("~", str(Path.home()))
                args = [main_file]
            else:
                print(f"⚠️  No main file specified for {server_id}")
                return {}

        # Handle environment variables
        env = {}
        if "requires_env" in server and server["requires_env"]:
            for env_var in server["requires_env"]:
                if env_var in self.credentials:
                    env[env_var] = self.credentials[env_var]
                elif env_var in os.environ:
                    env[env_var] = os.environ[env_var]

        # Format-specific configuration
        if format_type == "cursor":
            config = {
                "type": "stdio",
                "command": command,
                "args": args
            }
        else:  # claude-desktop, claude-code, etc.
            config = {
                "command": command,
                "args": args
            }

        if env:
            config["env"] = env

        return config

    def _generate_claude_config(self, servers: List[str]) -> Dict[str, Any]:
        """Generate Claude Desktop/Code configuration"""
        config = {"mcpServers": {}}
        for server_id in servers:
            server_config = self._build_server_config(server_id, "claude")
            if server_config:
                config["mcpServers"][server_id] = server_config
        return config

    def _generate_cursor_config(self, servers: List[str]) -> Dict[str, Any]:
        """Generate Cursor configuration"""
        config = {"mcpServers": {}}
        for server_id in servers:
            server_config = self._build_server_config(server_id, "cursor")
            if server_config:
                config["mcpServers"][server_id] = server_config
        return config

    def _generate_continue_config(self, servers: List[str]) -> Dict[str, Any]:
        """Generate Continue.dev configuration"""
        config = {
            "models": [
                {
                    "title": "Claude 3.5 Sonnet",
                    "provider": "anthropic",
                    "model": "claude-3-5-sonnet-20241022",
                    "apiKey": self.credentials.get("ANTHROPIC_API_KEY", "{{ANTHROPIC_API_KEY}}")
                }
            ],
            "mcpServers": {}
        }
        for server_id in servers:
            server_config = self._build_server_config(server_id, "continue")
            if server_config:
                config["mcpServers"][server_id] = server_config
        return config

    def _generate_vscode_config(self, servers: List[str]) -> Dict[str, Any]:
        """Generate VS Code/Cline configuration"""
        config = {"cline.mcpServers": {}}
        for server_id in servers:
            server_config = self._build_server_config(server_id, "vscode")
            if server_config:
                config["cline.mcpServers"][server_id] = server_config
        return config

    def test_server(self, server_id: str, timeout: int = 5) -> bool:
        """Test if a server can be started"""
        if server_id not in self.registry.get("servers", {}):
            print(f"❌ Server '{server_id}' not found in registry")
            return False

        server = self.registry["servers"][server_id]

        print(f"🧪 Testing {server.get('name', server_id)}...")

        # Build command
        if server.get("type") == "npm":
            cmd = [server.get("command", "npx")] + server.get("args", [])
        else:
            main_file = server.get("main_file", "")
            if not main_file:
                print(f"❌ No main file specified for {server_id}")
                return False

            main_file = main_file.replace("~", str(Path.home()))
            if not os.path.exists(main_file):
                print(f"❌ Main file not found: {main_file}")
                return False

            cmd = ["node", main_file]

        print(f"   Command: {' '.join(cmd)}")

        try:
            # Test if the server can start (run briefly)
            env = os.environ.copy()

            # Add required environment variables
            if "requires_env" in server:
                for env_var in server["requires_env"]:
                    if env_var in self.credentials:
                        env[env_var] = self.credentials[env_var]

            process = subprocess.Popen(
                cmd,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True,
                env=env
            )

            # Give it a moment to start
            time.sleep(timeout)

            if process.poll() is None:
                # Process is still running, good sign
                print(f"✅ {server.get('name', server_id)} started successfully")
                process.terminate()
                process.wait(timeout=2)
                return True
            else:
                # Process exited
                stdout, stderr = process.communicate()
                print(f"❌ {server.get('name', server_id)} failed to start")
                if stderr:
                    print(f"   Error: {stderr.strip()}")
                return False

        except FileNotFoundError:
            print(f"❌ Command not found: {cmd[0]}")
            return False
        except Exception as e:
            print(f"❌ Error testing {server.get('name', server_id)}: {e}")
            return False

    def health_check(self, server_id: Optional[str] = None) -> Dict[str, str]:
        """Check health of servers"""
        if server_id:
            if server_id not in self.registry.get("servers", {}):
                print(f"❌ Server '{server_id}' not found")
                return {}
            servers_to_check = {server_id: self.registry["servers"][server_id]}
        else:
            servers_to_check = self.registry.get("servers", {})

        print("🏥 Server Health Report")
        print("=" * 50)

        health_results = {}
        healthy_count = 0
        warning_count = 0
        error_count = 0

        for sid, server in servers_to_check.items():
            print(f"\n🔍 {sid}")

            # Check build status
            if server.get("type") == "npm":
                print("   ✅ NPM package (assumed available)")
                status = "healthy"
            elif server.get("built", False):
                main_file = server.get("main_file", "")
                if main_file:
                    main_file = main_file.replace("~", str(Path.home()))
                    if os.path.exists(main_file):
                        print(f"   ✅ Build available: {os.path.basename(main_file)}")
                        status = "healthy"
                    else:
                        print(f"   ❌ Main file not found: {main_file}")
                        status = "error"
                else:
                    print("   ⚠️  Built but no main file specified")
                    status = "warning"
            else:
                print("   ❌ No build output found")
                status = "error"

            # Check environment variables
            if "requires_env" in server and server["requires_env"]:
                env_status = self._check_env_vars(server["requires_env"])
                print(f"   Environment: {env_status}")
                if "❌" in env_status and status == "healthy":
                    status = "warning"

            # Update counters
            if status == "healthy":
                healthy_count += 1
                print("   ✅ Status: Healthy")
            elif status == "warning":
                warning_count += 1
                print("   ⚠️  Status: Warning")
            else:
                error_count += 1
                print("   ❌ Status: Error")

            health_results[sid] = status

        print(f"\n📊 Summary: {healthy_count} healthy, {warning_count} warnings, {error_count} errors")
        return health_results

def main():
    parser = argparse.ArgumentParser(description="Global MCP Manager")
    subparsers = parser.add_subparsers(dest="command", help="Available commands")

    # List command
    list_parser = subparsers.add_parser("list", help="List available servers")
    list_parser.add_argument("--category", help="Filter by category")
    list_parser.add_argument("--status", help="Filter by status")

    # Profiles command
    subparsers.add_parser("profiles", help="List server profiles")

    # Config command
    config_parser = subparsers.add_parser("config", help="Generate tool configuration")
    config_parser.add_argument("--tool", required=True, help="Target tool (claude-desktop, claude-code, cursor, etc.)")
    config_parser.add_argument("--profile", default="default", help="Server profile to use")
    config_parser.add_argument("--servers", nargs="+", help="Specific servers to include")
    config_parser.add_argument("--output", help="Output file path")

    # Test command
    test_parser = subparsers.add_parser("test", help="Test server connectivity")
    test_parser.add_argument("--server", required=True, help="Server ID to test")
    test_parser.add_argument("--timeout", type=int, default=5, help="Test timeout in seconds")

    # Health command
    health_parser = subparsers.add_parser("health", help="Check server health")
    health_parser.add_argument("--server", help="Check specific server (default: all)")

    args = parser.parse_args()

    if not args.command:
        parser.print_help()
        return

    try:
        manager = MCPGlobalManager()

        if args.command == "list":
            manager.list_servers(args.category if hasattr(args, 'category') else None)
        elif args.command == "profiles":
            manager.list_profiles()
        elif args.command == "config":
            config = manager.generate_config(
                args.tool,
                args.profile if hasattr(args, 'profile') else "default",
                args.servers if hasattr(args, 'servers') else None,
                args.output if hasattr(args, 'output') else None
            )
            if not hasattr(args, 'output') or not args.output:
                print(config)
        elif args.command == "test":
            success = manager.test_server(args.server, args.timeout if hasattr(args, 'timeout') else 5)
            sys.exit(0 if success else 1)
        elif args.command == "health":
            manager.health_check(args.server if hasattr(args, 'server') else None)

    except KeyboardInterrupt:
        print("\n⚠️  Operation cancelled by user")
        sys.exit(1)
    except Exception as e:
        print(f"❌ Error: {e}")
        sys.exit(1)

if __name__ == "__main__":
    main()