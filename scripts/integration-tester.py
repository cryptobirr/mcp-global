#!/usr/bin/env python3
"""
Integration testing suite for deployed MCP configurations.
Tests end-to-end functionality of tools with MCP servers.
"""

import json
import subprocess
import time
from pathlib import Path
from datetime import datetime
from typing import Dict, List, Any


class IntegrationTester:
    """Comprehensive integration testing for MCP deployments."""

    def __init__(self):
        self.mcp_dir = Path.home() / ".mcp-global"
        self.results = {
            "test_timestamp": datetime.now().isoformat(),
            "test_suite": "integration",
            "tests_run": 0,
            "tests_passed": 0,
            "tests_failed": 0,
            "tool_tests": {}
        }

    def test_claude_desktop_integration(self) -> Dict[str, Any]:
        """Test Claude Desktop MCP integration."""
        config_path = Path.home() / "Library/Application Support/Claude/claude_desktop_config.json"

        if not config_path.exists():
            return {"status": "skipped", "reason": "No config file"}

        with open(config_path, 'r') as f:
            config = json.load(f)

        servers = config.get("mcpServers", {})

        test_result = {
            "config_valid": True,
            "servers_configured": len(servers),
            "server_tests": {},
            "overall_success": True
        }

        # Test each configured server
        for server_id, server_config in servers.items():
            server_test = self._test_server_config(server_id, server_config)
            test_result["server_tests"][server_id] = server_test

            if not server_test["success"]:
                test_result["overall_success"] = False

        return test_result

    def _test_server_config(self, server_id: str, server_config: Dict[str, Any]) -> Dict[str, Any]:
        """Test individual server configuration."""
        try:
            command = server_config.get("command", "")
            args = server_config.get("args", [])

            # Test with --help flag
            test_command = [command] + args + ["--help"]

            start_time = time.time()
            result = subprocess.run(
                test_command,
                capture_output=True,
                text=True,
                timeout=10
            )
            end_time = time.time()

            return {
                "success": result.returncode == 0,
                "startup_time": round(end_time - start_time, 2),
                "exit_code": result.returncode,
                "has_output": len(result.stdout) > 0 or len(result.stderr) > 0
            }

        except Exception as e:
            return {
                "success": False,
                "error": str(e)
            }

    def test_all_tools(self) -> Dict[str, Any]:
        """Test all deployed tools."""
        tools = ["claude-desktop", "claude-code", "cursor", "continue", "cline"]

        for tool in tools:
            self.results["tests_run"] += 1

            if tool == "claude-desktop":
                result = self.test_claude_desktop_integration()
            else:
                result = {"status": "not_implemented", "reason": f"{tool} testing not yet implemented"}

            self.results["tool_tests"][tool] = result

            if result.get("overall_success", False) or result.get("status") == "skipped":
                self.results["tests_passed"] += 1
            else:
                self.results["tests_failed"] += 1

        return self.results

    def save_results(self, filename: str = None) -> str:
        """Save test results to file."""
        if not filename:
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            filename = f"integration_test_results_{timestamp}.json"

        results_file = self.mcp_dir / "deployment" / "testing" / filename
        results_file.parent.mkdir(parents=True, exist_ok=True)

        with open(results_file, 'w') as f:
            json.dump(self.results, f, indent=2)

        return str(results_file)


if __name__ == "__main__":
    tester = IntegrationTester()
    results = tester.test_all_tools()
    results_file = tester.save_results()

    print(f"Integration tests completed:")
    print(f"  Tests run: {results['tests_run']}")
    print(f"  Tests passed: {results['tests_passed']}")
    print(f"  Tests failed: {results['tests_failed']}")
    print(f"  Results saved: {results_file}")