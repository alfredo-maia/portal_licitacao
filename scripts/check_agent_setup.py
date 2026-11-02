#!/usr/bin/env python3
"""Check repository setup and declared skill assignment before dispatching work."""
import argparse
import json
import os
from pathlib import Path
import subprocess


def validate(root, command=None, agent_id=None):
    errors = []
    required = ['AGENTS.md', 'docs/agents/issue-tracker.md',
                'docs/agents/triage-labels.md', 'docs/agents/domain.md',
                'docs/agents/skill-routing.json']
    for relative in required:
        path = root / relative
        if not path.is_file() or not path.read_text().strip():
            errors.append('Missing or empty setup file: ' + relative)
    if errors:
        return {'ready': False, 'errors': errors,
                'nextCommand': '/setup-matt-pocock-skills'}
    try:
        routing = json.loads((root / 'docs/agents/skill-routing.json').read_text())
    except (ValueError, OSError) as error:
        return {'ready': False, 'errors': ['Invalid skill routing: ' + str(error)]}
    project_id = routing.get('projectId')
    if not project_id or project_id not in (root / 'docs/agents/issue-tracker.md').read_text():
        errors.append('Tracker document and routing projectId do not match')
    labels = (root / 'docs/agents/triage-labels.md').read_text()
    for name in ['needs-triage', 'needs-info', 'ready-for-agent', 'ready-for-human', 'wontfix']:
        if name not in labels:
            errors.append('Missing canonical triage label: ' + name)
    try:
        git_root = subprocess.run(['git', '-C', str(root), 'rev-parse', '--show-toplevel'],
                                  capture_output=True, text=True, timeout=5)
        if git_root.returncode or Path(git_root.stdout.strip()).resolve() != root:
            errors.append('Root is not the configured Git working tree')
    except (OSError, subprocess.TimeoutExpired):
        errors.append('Cannot verify Git working tree')
    if command:
        command = command.removeprefix('/')
        entry = routing.get('commands', {}).get(command)
        if not entry:
            errors.append('Unknown command: ' + command)
        else:
            if not (root / '.agents/skills' / command / 'SKILL.md').is_file():
                errors.append('Command entry is missing: ' + command)
            if agent_id and agent_id not in entry['assignedAgentIds']:
                errors.append('Skill is not assigned to this Paperclip agent: ' + command)
    return {'ready': not errors, 'projectId': project_id, 'command': command,
            'assignmentChecked': bool(agent_id and command), 'errors': errors}


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--root', type=Path, default=Path(__file__).resolve().parents[1])
    parser.add_argument('--command')
    parser.add_argument('--agent-id', default=os.environ.get('PAPERCLIP_AGENT_ID'))
    args = parser.parse_args()
    result = validate(args.root.resolve(), args.command, args.agent_id)
    print(json.dumps(result, ensure_ascii=False))
    raise SystemExit(0 if result['ready'] else 1)
