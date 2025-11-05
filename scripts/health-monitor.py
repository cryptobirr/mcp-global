#!/usr/bin/env python3
"""
MCP Global Health Monitor
========================

Monitors the health and connectivity of centralized MCP servers.
Part of the MCP Global management system.

Usage:
    python3 health-monitor.py [server_id]
    python3 health-monitor.py --all
    python3 health-monitor.py --summary

Author: MCP Global Migration System
Version: 1.0.0
"""

import json
import subprocess
import sys
import time
import shutil
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Optional, Any, Tuple
import argparse


class HealthMonitor:
    """Health monitoring system for MCP servers."""

    def __init__(self):
        """Initialize the health monitor."""
        self.mcp_dir = Path.home() / ".mcp-global"
        self.registry_path = self.mcp_dir / "registry" / "global-registry.json"
        self.credentials_path = self.mcp_dir / "shared" / "credentials" / "extracted_credentials.json"
        self.servers_dir = self.mcp_dir / "servers" / "binaries"

        # Load registry and credentials
        self.registry = self._load_registry()
        self.credentials = self._load_credentials()

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

    def check_system_dependencies(self) -> Dict[str, bool]:
        """Check system-level dependencies."""
        dependencies = {}

        # Check Node.js
        try:
            result = subprocess.run(['node', '--version'],
                                  capture_output=True, text=True, timeout=5)
            dependencies['nodejs'] = result.returncode == 0
        except (subprocess.TimeoutExpired, FileNotFoundError):
            dependencies['nodejs'] = False

        # Check Python
        try:
            result = subprocess.run(['python3', '--version'],
                                  capture_output=True, text=True, timeout=5)
            dependencies['python'] = result.returncode == 0
        except (subprocess.TimeoutExpired, FileNotFoundError):
            dependencies['python'] = False

        # Check npm
        try:
            result = subprocess.run(['npm', '--version'],
                                  capture_output=True, text=True, timeout=5)
            dependencies['npm'] = result.returncode == 0
        except (subprocess.TimeoutExpired, FileNotFoundError):
            dependencies['npm'] = False

        # Check uv (for Python servers)
        dependencies['uv'] = shutil.which('uv') is not None

        return dependencies

    def check_server_build_status(self, server_id: str) -> Dict[str, Any]:
        """Check if a server is built and ready."""
        server_info = self.registry.get('servers', {}).get(server_id, {})
        server_type = server_info.get('type', 'unknown')
        server_path = Path(server_info.get('path', '').replace('~', str(Path.home())))

        build_status = {
            'server_exists': server_path.exists(),
            'build_available': False,
            'main_file_exists': False,
            'build_path': None,
            'main_file_path': None,
            'package_json_exists': False,
            'dependencies_installed': False
        }

        if not build_status['server_exists']:
            return build_status

        # Check for package.json (Node.js projects)
        package_json = server_path / 'package.json'
        build_status['package_json_exists'] = package_json.exists()

        # Check for node_modules (dependencies installed)
        node_modules = server_path / 'node_modules'
        build_status['dependencies_installed'] = node_modules.exists()

        # Check build output based on server type
        if server_type == 'nodejs':
            # Check common build directories
            build_dirs = ['build', 'dist', 'lib']
            for build_dir in build_dirs:
                build_path = server_path / build_dir
                if build_path.exists():
                    build_status['build_available'] = True
                    build_status['build_path'] = str(build_path)

                    # Look for main files
                    main_files = ['index.js', 'main.js', 'server.js']
                    for main_file in main_files:
                        main_file_path = build_path / main_file
                        if main_file_path.exists():
                            build_status['main_file_exists'] = True
                            build_status['main_file_path'] = str(main_file_path)
                            break
                    break

        elif server_type == 'python':
            # Check for Python main files
            main_files = ['main.py', '__main__.py', 'app.py', 'server.py']
            for main_file in main_files:
                main_file_path = server_path / main_file
                if main_file_path.exists():
                    build_status['build_available'] = True
                    build_status['main_file_exists'] = True
                    build_status['main_file_path'] = str(main_file_path)
                    break

        elif server_type == 'npm':
            # NPM servers don't need local builds
            build_status['build_available'] = True
            build_status['main_file_exists'] = True

        return build_status

    def check_environment_variables(self, server_id: str) -> Dict[str, Any]:
        """Check if required environment variables are available."""
        server_info = self.registry.get('servers', {}).get(server_id, {})
        required_env = server_info.get('requires_env', [])

        env_status = {
            'required_vars': required_env,
            'available_vars': {},
            'missing_vars': [],
            'all_present': True
        }

        for var_name in required_env:
            # Check in system environment
            import os
            value = os.environ.get(var_name)

            # Check in extracted credentials
            if not value and var_name in self.credentials:
                value = "[CREDENTIAL_AVAILABLE]"

            env_status['available_vars'][var_name] = bool(value)
            if not value:
                env_status['missing_vars'].append(var_name)
                env_status['all_present'] = False

        return env_status

    def test_server_startup(self, server_id: str, timeout: int = 10) -> Dict[str, Any]:
        """Test if a server can start up successfully."""
        server_info = self.registry.get('servers', {}).get(server_id, {})
        server_type = server_info.get('type', 'unknown')

        startup_result = {
            'can_start': False,
            'exit_code': None,
            'stdout': '',
            'stderr': '',
            'error': None,
            'command': None
        }

        try:
            if server_type == 'npm':
                # NPM servers
                package = server_info.get('package', '')
                if package:
                    cmd = ['npx', '-y', package, '--help']
                    startup_result['command'] = ' '.join(cmd)
                else:
                    startup_result['error'] = "No package specified for NPM server"
                    return startup_result

            elif server_type in ['nodejs', 'python']:
                # Local servers
                main_file = server_info.get('main_file', '')
                if not main_file:
                    startup_result['error'] = "No main file specified"
                    return startup_result

                main_file_path = main_file.replace('~', str(Path.home()))
                if not Path(main_file_path).exists():
                    startup_result['error'] = f"Main file not found: {main_file_path}"
                    return startup_result

                if server_type == 'nodejs':
                    cmd = ['node', main_file_path, '--help']
                else:  # python
                    cmd = ['python3', main_file_path, '--help']

                startup_result['command'] = ' '.join(cmd)
            else:
                startup_result['error'] = f"Unknown server type: {server_type}"
                return startup_result

            # Run the test command
            result = subprocess.run(
                cmd,
                capture_output=True,
                text=True,
                timeout=timeout
            )

            startup_result['can_start'] = result.returncode == 0
            startup_result['exit_code'] = result.returncode
            startup_result['stdout'] = result.stdout
            startup_result['stderr'] = result.stderr

        except subprocess.TimeoutExpired:
            startup_result['error'] = f"Command timed out after {timeout} seconds"
        except FileNotFoundError as e:
            startup_result['error'] = f"Command not found: {e}"
        except Exception as e:
            startup_result['error'] = f"Unexpected error: {e}"

        return startup_result

    def check_server_health(self, server_id: str, full_test: bool = False) -> Dict[str, Any]:
        """Comprehensive health check for a single server."""
        if server_id not in self.registry.get('servers', {}):
            return {
                'server_id': server_id,
                'exists': False,
                'error': f"Server '{server_id}' not found in registry"
            }

        server_info = self.registry['servers'][server_id]

        health_report = {
            'server_id': server_id,
            'name': server_info.get('name', server_id),
            'type': server_info.get('type', 'unknown'),
            'category': server_info.get('category', 'uncategorized'),
            'exists': True,
            'timestamp': datetime.now().isoformat(),
            'overall_status': 'unknown',
            'checks': {}
        }

        # Build status check
        build_status = self.check_server_build_status(server_id)
        health_report['checks']['build'] = build_status

        # Environment variables check
        env_status = self.check_environment_variables(server_id)
        health_report['checks']['environment'] = env_status

        # Startup test (optional for performance)
        if full_test:
            startup_status = self.test_server_startup(server_id)
            health_report['checks']['startup'] = startup_status

        # Determine overall status
        if not build_status['server_exists']:
            health_report['overall_status'] = 'missing'
        elif not build_status['build_available']:
            health_report['overall_status'] = 'build_needed'
        elif not env_status['all_present']:
            health_report['overall_status'] = 'env_missing'
        elif full_test and not health_report['checks']['startup']['can_start']:
            health_report['overall_status'] = 'startup_failed'
        else:
            health_report['overall_status'] = 'healthy'

        return health_report

    def monitor_all_servers(self, full_test: bool = False) -> Dict[str, Dict[str, Any]]:
        """Monitor health of all servers."""
        all_reports = {}

        for server_id in self.registry.get('servers', {}):
            all_reports[server_id] = self.check_server_health(server_id, full_test)

        return all_reports

    def print_health_summary(self, reports: Dict[str, Dict[str, Any]]):
        """Print a formatted health summary."""
        print("Server Health Report:")
        print("=" * 50)
        print()

        # Count statuses
        status_counts = {
            'healthy': 0,
            'env_missing': 0,
            'build_needed': 0,
            'startup_failed': 0,
            'missing': 0
        }

        # Group by category
        by_category = {}
        for server_id, report in reports.items():
            category = report.get('category', 'uncategorized')
            if category not in by_category:
                by_category[category] = []
            by_category[category].append((server_id, report))

            status = report.get('overall_status', 'unknown')
            if status in status_counts:
                status_counts[status] += 1

        # Print by category
        for category, servers in sorted(by_category.items()):
            print(f"📁 {category.upper()}:")
            for server_id, report in servers:
                status = report.get('overall_status', 'unknown')
                name = report.get('name', server_id)
                server_type = report.get('type', 'unknown')

                # Status icons
                status_icons = {
                    'healthy': '✅',
                    'env_missing': '⚠️ ',
                    'build_needed': '🔨',
                    'startup_failed': '❌',
                    'missing': '❌'
                }

                icon = status_icons.get(status, '❓')
                print(f"  {icon} {server_id} ({server_type})")

                # Show issues
                if status == 'env_missing':
                    missing_vars = report.get('checks', {}).get('environment', {}).get('missing_vars', [])
                    print(f"     Missing env vars: {', '.join(missing_vars)}")
                elif status == 'build_needed':
                    print(f"     Needs building")
                elif status == 'startup_failed':
                    startup_error = report.get('checks', {}).get('startup', {}).get('error', 'Unknown error')
                    print(f"     Startup failed: {startup_error}")
                elif status == 'missing':
                    print(f"     Server directory not found")
            print()

        # Summary
        total = len(reports)
        print(f"Summary: {status_counts['healthy']} healthy, {status_counts['env_missing']} env issues, "
              f"{status_counts['build_needed']} need building, {status_counts['startup_failed']} startup failed, "
              f"{status_counts['missing']} missing ({total} total)")


def main():
    """Main CLI interface."""
    parser = argparse.ArgumentParser(description='MCP Global Health Monitor')
    parser.add_argument('server_id', nargs='?', help='Specific server to check')
    parser.add_argument('--all', action='store_true', help='Check all servers')
    parser.add_argument('--summary', action='store_true', help='Show summary only')
    parser.add_argument('--full-test', action='store_true', help='Include startup tests (slower)')
    parser.add_argument('--json', action='store_true', help='Output as JSON')

    args = parser.parse_args()

    monitor = HealthMonitor()

    if args.server_id:
        # Single server check
        report = monitor.check_server_health(args.server_id, args.full_test)

        if args.json:
            print(json.dumps(report, indent=2))
        else:
            monitor.print_health_summary({args.server_id: report})

    elif args.all or args.summary:
        # All servers check
        reports = monitor.monitor_all_servers(args.full_test)

        if args.json:
            print(json.dumps(reports, indent=2))
        else:
            monitor.print_health_summary(reports)

    else:
        # Default: show system dependencies and quick summary
        print("MCP Global Health Monitor")
        print("=" * 30)
        print()

        # System dependencies
        deps = monitor.check_system_dependencies()
        print("System Dependencies:")
        for dep, available in deps.items():
            status = "✅" if available else "❌"
            print(f"  {status} {dep}")
        print()

        # Quick server summary
        reports = monitor.monitor_all_servers(full_test=False)
        monitor.print_health_summary(reports)

        print()
        print("Usage:")
        print("  --all          Check all servers in detail")
        print("  --full-test    Include startup tests (slower)")
        print("  <server_id>    Check specific server")


if __name__ == '__main__':
    main()