"""
Command Line Interface for Regex Hunter.
"""

import argparse
import sys
import os
from pathlib import Path
import uvicorn
from rich.console import Console
from rich.panel import Panel
from rich.table import Table

try:
    from regexhunter import __version__
except Exception:
    __version__ = "1.0.0"
from regexhunter.security import get_or_create_token
from regexhunter.storage import StorageManager
from regexhunter.server import create_app

console = Console()


def parse_args():
    parser = argparse.ArgumentParser(
        prog="regexhunter",
        description="Regex Hunter — Local daemon for Chrome Extension recon and regex extraction.",
        formatter_class=argparse.RawTextHelpFormatter,
    )
    parser.add_argument(
        "-o", "--output",
        default="./results",
        help="Directory where extracted matches will be stored (default: ./results)"
    )
    parser.add_argument(
        "-oj", "--json",
        action="store_true",
        help="Enable rich JSON metadata logging (saves metadata.jsonl alongside matches.txt)"
    )
    parser.add_argument(
        "-p", "--port",
        type=int,
        default=8787,
        help="Local port to bind HTTP server (default: 8787)"
    )
    parser.add_argument(
        "-b", "--bind",
        default="127.0.0.1",
        help="Interface to bind (default: 127.0.0.1; non-loopback interfaces trigger security warnings)"
    )
    parser.add_argument(
        "--token",
        default=None,
        help="Bearer token for extension authentication (auto-generated if omitted)"
    )
    parser.add_argument(
        "--clear-token",
        action="store_true",
        help="Regenerate the local authentication token"
    )
    parser.add_argument(
        "-s", "--silent",
        action="store_true",
        help="Silent mode: outputs ONLY raw matched strings (one per line) to stdout, suitable for piping into anew, httpx, etc."
    )
    parser.add_argument(
        "-v", "--verbose",
        action="store_true",
        help="Enable verbose output (prints incoming matches in real time)"
    )
    parser.add_argument(
        "--version",
        action="version",
        version=f"Regex Hunter v{__version__}"
    )
    return parser.parse_args()


def display_banner(bind: str, port: int, output_dir: Path, json_mode: bool, token: str):
    if bind not in ("127.0.0.1", "localhost", "::1"):
        console.print("[bold red][!] WARNING: Server is not bound to loopback interface. This may expose the API to LAN![/bold red]")

    info_table = Table(show_header=False, box=None)
    info_table.add_row("[bold cyan]Binding Address[/bold cyan]", f"[green]http://{bind}:{port}[/green]")
    info_table.add_row("[bold cyan]Output Directory[/bold cyan]", f"[yellow]{output_dir.resolve()}[/yellow]")
    info_table.add_row("[bold cyan]Metadata Logging[/bold cyan]", f"[bold]{'ENABLED (matches.txt + metadata.jsonl)' if json_mode else 'DISABLED (matches.txt only)'}[/bold]")
    info_table.add_row("[bold cyan]Extension Token[/bold cyan]", f"[bold magenta]{token}[/bold magenta]")
    info_table.add_row("[bold cyan]Status[/bold cyan]", "[bold green]LISTENING FOR CHROME MATCHES (Ctrl+C to stop)[/bold green]")

    panel = Panel(
        info_table,
        title="[bold red]🎯 REGEX HUNTER[/bold red] - Bug Bounty Recon Daemon",
        subtitle=f"v{__version__}",
        border_style="bright_blue"
    )
    console.print(panel)


def main():
    args = parse_args()

    output_path = Path(args.output).resolve()
    token = get_or_create_token(args.token, force_new=args.clear_token)

    storage_manager = StorageManager(output_path, json_metadata=args.json)

    if not args.silent:
        display_banner(
            bind=args.bind,
            port=args.port,
            output_dir=output_path,
            json_mode=args.json,
            token=token
        )

    app = create_app(storage_manager, token=token, verbose=args.verbose, silent=args.silent)

    # In silent mode, set log_level to critical and disable access logs
    log_level = "critical" if args.silent else ("info" if args.verbose else "warning")

    # Run uvicorn
    uvicorn.run(
        app,
        host=args.bind,
        port=args.port,
        log_level=log_level,
        access_log=False if args.silent else args.verbose
    )


if __name__ == "__main__":
    main()

