#!/usr/bin/env python3
"""
MCP Global Deployment Manager
============================

Safely deploys generated configurations to LLM tools with comprehensive
backup, testing, and rollback capabilities.

Usage:
    python3 deployment-manager.py --strategy conservative
    python3 deployment-manager.py --strategy development --dry-run
    python3 deployment-manager.py --rollback --tool claude-desktop

Author: MCP Global Migration System
Version: 1.0.0
"""

import json
import shutil
import os
import sys
import argparse
import subprocess
import time
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Any, Optional, Tuple


class DeploymentManager:
    """Manages safe deployment of MCP configurations to tools."""

    def __init__(self):
        """Initialize the deployment manager."""
        self.mcp_dir = Path.home() / ".mcp-global"
        self.deployment_dir = self.mcp_dir / "deployment"
        self.generated_dir = self.mcp_dir / "generated"
        self.backups_dir = self.deployment_dir / "backups"
        self.strategies_dir = self.deployment_dir / "strategies"
        self.testing_dir = self.deployment_dir / "testing"

        # Tool configuration paths
        self.tool_paths = {
            "claude-desktop": Path.home() / "Library/Application Support/Claude/claude_desktop_config.json",
            "claude-code": Path.home() / ".config/claude-code/mcp_servers.json",
            "cursor": Path.cwd() / "mcp.json",  # Current project directory
            "continue": Path.home() / ".continue/config.json",
            "cline": Path.home() / "Library/Application Support/Code/User/settings.json"
        }

    def load_strategy(self, strategy_name: str) -> Dict[str, Any]:
        """Load deployment strategy from file."""
        strategy_file = self.strategies_dir / f"{strategy_name}.json"
        if not strategy_file.exists():
            raise FileNotFoundError(f"Strategy '{strategy_name}' not found")

        with open(strategy_file, 'r') as f:
            return json.load(f)

    def create_deployment_log_entry(self, action: str, tool: str, details: Dict[str, Any]) -> None:
        """Add entry to deployment log."""
        log_file = self.deployment_dir / "deployed" / "deployment_log.json"

        # Load existing log or create new
        if log_file.exists():
            with open(log_file, 'r') as f:
                log = json.load(f)
        else:
            log = {"deployments": [], "rollbacks": []}

        entry = {
            "timestamp": datetime.now().isoformat(),
            "action": action,
            "tool": tool,
            "details": details
        }

        if action == "deploy":
            log["deployments"].append(entry)
        elif action == "rollback":
            log["rollbacks"].append(entry)

        # Ensure directory exists
        log_file.parent.mkdir(parents=True, exist_ok=True)

        with open(log_file, 'w') as f:
            json.dump(log, f, indent=2)

    def backup_current_config(self, tool: str) -> Optional[str]:
        """Backup current configuration for a tool."""
        tool_path = self.tool_paths[tool]

        if not tool_path.exists():
            print(f"ℹ️  No existing config for {tool}")
            return None

        # Create backup
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        backup_file = self.backups_dir / tool / f"pre_deployment_{timestamp}.json"
        backup_file.parent.mkdir(parents=True, exist_ok=True)

        shutil.copy2(tool_path, backup_file)
        print(f"✅ Backed up {tool} config to {backup_file}")

        return str(backup_file)

    def deploy_config_to_tool(self, tool: str, profile: str, dry_run: bool = False) -> Tuple[bool, str]:
        """Deploy generated configuration to specific tool."""
        # Get generated config
        config_file = self.generated_dir / tool / f"{profile}.json"
        if not config_file.exists():
            return False, f"Generated config not found: {config_file}"

        # Load generated config
        with open(config_file, 'r') as f:
            config = json.load(f)

        # Get tool path
        tool_path = self.tool_paths[tool]

        if dry_run:
            print(f"🔍 DRY RUN: Would deploy {config_file} to {tool_path}")
            return True, "Dry run successful"

        # Backup current config
        backup_path = self.backup_current_config(tool)

        try:
            # Ensure parent directory exists
            tool_path.parent.mkdir(parents=True, exist_ok=True)

            # Deploy new config
            with open(tool_path, 'w') as f:
                json.dump(config, f, indent=2)

            print(f"✅ Deployed {tool} config ({profile} profile)")

            # Log deployment
            self.create_deployment_log_entry("deploy", tool, {
                "profile": profile,
                "config_file": str(config_file),
                "tool_path": str(tool_path),
                "backup_path": backup_path,
                "servers_count": len(config.get("mcpServers", config.get("cline.mcpServers", {})))
            })

            return True, "Deployment successful"

        except Exception as e:
            return False, f"Deployment failed: {e}"

    def test_tool_config_acceptance(self, tool: str) -> Tuple[bool, str]:
        """Test if tool accepts the deployed configuration."""
        tool_path = self.tool_paths[tool]

        if not tool_path.exists():
            return False, "No config file found"

        # Test JSON validity
        try:
            with open(tool_path, 'r') as f:
                config = json.load(f)
        except json.JSONDecodeError as e:
            return False, f"Invalid JSON: {e}"

        # Tool-specific validation
        if tool in ["claude-desktop", "claude-code"]:
            if "mcpServers" not in config:
                return False, "Missing mcpServers key"
        elif tool == "cursor":
            if "mcpServers" not in config:
                return False, "Missing mcpServers key"
            # Check for required "type": "stdio"
            for server_id, server_config in config["mcpServers"].items():
                if server_config.get("type") != "stdio":
                    return False, f"Server {server_id} missing type: stdio"
        elif tool == "continue":
            if "mcpServers" not in config:
                return False, "Missing mcpServers key"
            if "models" not in config:
                return False, "Missing models key"
        elif tool == "cline":
            if "cline.mcpServers" not in config:
                return False, "Missing cline.mcpServers key"

        return True, "Configuration accepted"

    def test_server_connectivity(self, tool: str, timeout: int = 10) -> Dict[str, Any]:
        """Test connectivity to MCP servers through the tool."""
        tool_path = self.tool_paths[tool]

        if not tool_path.exists():
            return {"status": "error", "message": "No config file found"}

        # Load config
        with open(tool_path, 'r') as f:
            config = json.load(f)

        # Get servers
        servers = config.get("mcpServers", config.get("cline.mcpServers", {}))

        connectivity_results = {
            "timestamp": datetime.now().isoformat(),
            "tool": tool,
            "servers_tested": len(servers),
            "server_results": {},
            "overall_success": True
        }

        for server_id, server_config in servers.items():
            result = self._test_individual_server(server_id, server_config, timeout)
            connectivity_results["server_results"][server_id] = result

            if not result["success"]:
                connectivity_results["overall_success"] = False

        return connectivity_results

    def _test_individual_server(self, server_id: str, server_config: Dict[str, Any], timeout: int) -> Dict[str, Any]:
        """Test individual server startup."""
        try:
            command = server_config.get("command", "")
            args = server_config.get("args", [])
            env_vars = server_config.get("env", {})

            if not command:
                return {"success": False, "error": "No command specified"}

            # Build full command
            full_command = [command] + args + ["--help"]  # Use --help to test startup

            # Prepare environment
            env = os.environ.copy()
            env.update(env_vars)

            # Test server startup
            start_time = time.time()
            result = subprocess.run(
                full_command,
                capture_output=True,
                text=True,
                timeout=timeout,
                env=env
            )
            end_time = time.time()

            return {
                "success": result.returncode == 0,
                "startup_time": round(end_time - start_time, 2),
                "command": " ".join(full_command),
                "exit_code": result.returncode,
                "stdout": result.stdout[:500],  # Truncate for space
                "stderr": result.stderr[:500] if result.stderr else ""
            }

        except subprocess.TimeoutExpired:
            return {"success": False, "error": f"Timeout after {timeout}s"}
        except Exception as e:
            return {"success": False, "error": str(e)}

    def rollback_tool(self, tool: str) -> Tuple[bool, str]:
        """Rollback tool to previous configuration."""
        # Find most recent backup
        backup_dir = self.backups_dir / tool
        if not backup_dir.exists():
            return False, f"No backups found for {tool}"

        backup_files = list(backup_dir.glob("*.json"))
        if not backup_files:
            return False, f"No backup files found for {tool}"

        # Get most recent backup
        latest_backup = max(backup_files, key=lambda f: f.stat().st_mtime)

        try:
            tool_path = self.tool_paths[tool]

            # Restore backup
            shutil.copy2(latest_backup, tool_path)

            print(f"✅ Rolled back {tool} to {latest_backup}")

            # Log rollback
            self.create_deployment_log_entry("rollback", tool, {
                "backup_file": str(latest_backup),
                "tool_path": str(tool_path)
            })

            return True, "Rollback successful"

        except Exception as e:
            return False, f"Rollback failed: {e}"

    def execute_strategy(self, strategy_name: str, dry_run: bool = False) -> Dict[str, Any]:
        """Execute complete deployment strategy."""
        strategy = self.load_strategy(strategy_name)

        results = {
            "strategy": strategy_name,
            "start_time": datetime.now().isoformat(),
            "dry_run": dry_run,
            "deployments": {},
            "tests": {},
            "overall_success": True,
            "errors": []
        }

        print(f"🚀 Executing deployment strategy: {strategy_name}")
        if dry_run:
            print("🔍 DRY RUN MODE - No actual changes will be made")

        # Deploy to each tool in priority order
        tools_by_priority = sorted(
            strategy["tools"].items(),
            key=lambda x: x[1].get("priority", 99)
        )

        for tool, tool_config in tools_by_priority:
            if not tool_config.get("deploy", False):
                continue

            print(f"\n📦 Deploying to {tool}...")

            # Deploy configuration
            success, message = self.deploy_config_to_tool(
                tool,
                tool_config["profile"],
                dry_run
            )

            results["deployments"][tool] = {
                "success": success,
                "message": message,
                "profile": tool_config["profile"]
            }

            if not success:
                results["overall_success"] = False
                results["errors"].append(f"{tool}: {message}")

                # Check rollback trigger
                if strategy.get("rollback_trigger") == "any_failure":
                    print(f"❌ Deployment failed for {tool}, triggering rollback")
                    break
                continue

            # Test configuration if required
            if tool_config.get("test_required", False) and not dry_run:
                print(f"🧪 Testing {tool} configuration...")

                # Test config acceptance
                accept_success, accept_message = self.test_tool_config_acceptance(tool)

                # Test server connectivity
                connectivity_results = self.test_server_connectivity(tool)

                results["tests"][tool] = {
                    "config_acceptance": {
                        "success": accept_success,
                        "message": accept_message
                    },
                    "connectivity": connectivity_results
                }

                if not accept_success:
                    results["overall_success"] = False
                    results["errors"].append(f"{tool} config test failed: {accept_message}")

        results["end_time"] = datetime.now().isoformat()

        # Save results
        results_file = self.testing_dir / f"deployment_results_{strategy_name}_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json"
        with open(results_file, 'w') as f:
            json.dump(results, f, indent=2)

        return results

    def status(self) -> Dict[str, Any]:
        """Get current deployment status."""
        status = {
            "timestamp": datetime.now().isoformat(),
            "tools": {},
            "total_deployments": 0,
            "total_rollbacks": 0
        }

        # Check each tool
        for tool in self.tool_paths:
            tool_path = self.tool_paths[tool]
            status["tools"][tool] = {
                "config_exists": tool_path.exists(),
                "config_path": str(tool_path),
                "last_modified": tool_path.stat().st_mtime if tool_path.exists() else None
            }

        # Get deployment log stats
        log_file = self.deployment_dir / "deployed" / "deployment_log.json"
        if log_file.exists():
            with open(log_file, 'r') as f:
                log = json.load(f)
            status["total_deployments"] = len(log.get("deployments", []))
            status["total_rollbacks"] = len(log.get("rollbacks", []))

        return status


def main():
    """Main CLI interface."""
    parser = argparse.ArgumentParser(description='MCP Global Deployment Manager')
    parser.add_argument('--strategy', help='Deployment strategy to execute')
    parser.add_argument('--dry-run', action='store_true', help='Show what would be deployed without making changes')
    parser.add_argument('--rollback', action='store_true', help='Rollback deployments')
    parser.add_argument('--tool', help='Specific tool for rollback')
    parser.add_argument('--status', action='store_true', help='Show deployment status')
    parser.add_argument('--test', help='Test connectivity for specific tool')

    args = parser.parse_args()

    manager = DeploymentManager()

    if args.status:
        status = manager.status()
        print(json.dumps(status, indent=2))

    elif args.rollback:
        if not args.tool:
            print("❌ --tool required for rollback")
            sys.exit(1)

        success, message = manager.rollback_tool(args.tool)
        if success:
            print(f"✅ {message}")
        else:
            print(f"❌ {message}")
            sys.exit(1)

    elif args.test:
        results = manager.test_server_connectivity(args.test)
        print(json.dumps(results, indent=2))

    elif args.strategy:
        try:
            results = manager.execute_strategy(args.strategy, args.dry_run)

            if results["overall_success"]:
                print(f"\n✅ Strategy '{args.strategy}' completed successfully")
            else:
                print(f"\n❌ Strategy '{args.strategy}' failed:")
                for error in results["errors"]:
                    print(f"  - {error}")
                sys.exit(1)

        except Exception as e:
            print(f"❌ Error executing strategy: {e}")
            sys.exit(1)

    else:
        print("Use --strategy, --rollback, --status, or --test")
        parser.print_help()


if __name__ == '__main__':
    main()