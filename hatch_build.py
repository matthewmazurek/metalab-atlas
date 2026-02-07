"""Hatch build hook that compiles the React frontend into static assets.

Runs `npm install && npm run build` in the frontend/ directory so that
atlas/static/ is populated before the Python package is assembled.
"""

from __future__ import annotations

import shutil
import subprocess
from pathlib import Path

from hatchling.builders.hooks.plugin.interface import BuildHookInterface


class FrontendBuildHook(BuildHookInterface):
    PLUGIN_NAME = "frontend"

    def initialize(self, version: str, build_data: dict) -> None:
        frontend_dir = Path(self.root) / "frontend"
        static_dir = Path(self.root) / "atlas" / "static"

        # If static assets already exist (e.g. building wheel from sdist),
        # skip the npm build.
        if (static_dir / "index.html").exists():
            self.app.display_info(
                "atlas/static/ already present — skipping frontend build"
            )
            self._include_static(build_data, static_dir)
            return

        if not frontend_dir.exists():
            self.app.display_warning(
                "frontend/ directory not found — skipping frontend build"
            )
            return

        npm = shutil.which("npm")
        if npm is None:
            self.app.display_warning(
                "npm not found on PATH — skipping frontend build. "
                "Install Node.js to bundle the dashboard UI."
            )
            return

        self.app.display_info("Installing frontend dependencies …")
        subprocess.run(
            [npm, "install"],
            cwd=frontend_dir,
            check=True,
        )

        self.app.display_info("Building frontend …")
        subprocess.run(
            [npm, "run", "build"],
            cwd=frontend_dir,
            check=True,
        )

        if not static_dir.exists():
            raise RuntimeError(
                f"Frontend build succeeded but {static_dir} was not created"
            )

        self.app.display_success("Frontend build complete")
        self._include_static(build_data, static_dir)

    # ------------------------------------------------------------------

    def _include_static(self, build_data: dict, static_dir: Path) -> None:
        """Ensure static assets end up in the package.

        For sdist builds the generated files aren't in the pre-computed
        include list, so we inject them via force_include.  For wheel
        builds the files are already discovered via ``packages = ["atlas"]``
        so we skip to avoid duplicate-name warnings.
        """
        if self.target_name != "wheel":
            build_data["force_include"][str(static_dir)] = "atlas/static"

    def clean(self, versions: list[str]) -> None:
        static_dir = Path(self.root) / "atlas" / "static"
        if static_dir.exists():
            shutil.rmtree(static_dir)
            self.app.display_info("Cleaned atlas/static/")
