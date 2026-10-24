#!/usr/bin/env bash
# skills-cloud.sh - laeuft automatisch beim Start jeder Claude-Code-Cloud-Sitzung
# (SessionStart-Hook in .claude/settings.json jedes Projekts).
# Installiert Philips Skills aus MoinMornhart/claude-skills nach ~/.claude/skills.
# Still: keine Ausgabe, wenn alles klappt. Bricht nie ab, blockiert nie die Sitzung.
# Lokal (Windows-PC) tut es nichts - dort erledigt das MorniSync.

[[ "${CLAUDE_CODE_REMOTE:-}" == "true" || "${1:-}" == "--force" ]] || exit 0

ZIEL="${HOME}/.claude/skills"
LOG="${HOME}/.claude/skills-cloud.log"
ARBEIT="$(mktemp -d 2>/dev/null || echo /tmp/skills-cloud.$$)"
mkdir -p "$ZIEL" "$ARBEIT"

# Ersatzliste, falls das private Repo claude-skills in der Sitzung nicht erreichbar ist.
# Wird von cloud/cloud-einrichten.sh aus skills-auswahl.txt erzeugt.
ERSATZ=$(cat <<'LISTE'
vercel-labs/skills find-skills
mattpocock/skills grill-me
mattpocock/skills to-spec
mattpocock/skills prototype
obra/superpowers brainstorming
obra/superpowers writing-plans
obra/superpowers executing-plans
mattpocock/skills handoff
juliusbrussee/caveman caveman
obra/superpowers systematic-debugging
obra/superpowers verification-before-completion
mattpocock/skills tdd
mattpocock/skills git-guardrails-claude-code
leonxlnx/taste-skill design-taste-frontend
vercel-labs/agent-skills web-design-guidelines
nextlevelbuilder/ui-ux-pro-max-skill ui-ux-pro-max
shadcn/ui shadcn
heygen-com/hyperframes hyperframes
remotion-dev/skills remotion-best-practices
coreyhaines31/marketingskills seo-audit
supabase/agent-skills supabase-postgres-best-practices
obra/superpowers subagent-driven-development
obra/superpowers dispatching-parallel-agents
trailofbits/skills semgrep
trailofbits/skills sharp-edges
trailofbits/skills supply-chain-risk-auditor
trailofbits/skills differential-review
LISTE
)

lauf() {
  # 1) Neueste Liste aus dem Repo holen, sonst Ersatzliste
  local liste=""
  if timeout 30 git clone -q --depth 1 https://github.com/MoinMornhart/claude-skills "$ARBEIT/claude-skills" 2>/dev/null \
     && [[ -f "$ARBEIT/claude-skills/skills-auswahl.txt" ]]; then
    liste="$(cat "$ARBEIT/claude-skills/skills-auswahl.txt")"
  else
    liste="$ERSATZ"
  fi

  # 2) Fehlende Skills einsammeln, gruppiert nach Quell-Repo
  declare -A fehlt=()
  while read -r repo skill _; do
    [[ -z "${repo:-}" || "$repo" == \#* || -z "${skill:-}" ]] && continue
    [[ "$repo" =~ ^[A-Za-z0-9._-]+/[A-Za-z0-9._-]+$ && "$skill" =~ ^[A-Za-z0-9._-]+$ ]] || continue
    [[ -f "$ZIEL/$skill/SKILL.md" ]] && continue
    fehlt[$repo]+="$skill "
  done <<< "$liste"
  [[ ${#fehlt[@]} -eq 0 ]] && return 0

  # 3) Je Quell-Repo einmal flach klonen und die Skill-Ordner kopieren
  local fehler=""
  for repo in "${!fehlt[@]}"; do
    local d="$ARBEIT/src/${repo//\//_}"
    if ! timeout 120 git clone -q --depth 1 "https://github.com/$repo" "$d" 2>/dev/null; then
      fehler+=" ${fehlt[$repo]}"; continue
    fi
    for skill in ${fehlt[$repo]}; do
      local quelle=""
      # Ordner mit gleichem Namen und SKILL.md suchen (skills/<name>, .claude/skills/<name>, <name>, ...)
      quelle="$(find "$d" -type f -name SKILL.md -path "*/$skill/SKILL.md" -not -path '*/node_modules/*' 2>/dev/null | awk '{print length, $0}' | sort -n | head -1 | cut -d' ' -f2-)"
      # sonst per "name:" in der Kopfzeile
      if [[ -z "$quelle" ]]; then
        quelle="$(grep -rlE --include=SKILL.md "^name:[[:space:]]*['\"]?$skill['\"]?[[:space:]]*$" "$d" 2>/dev/null | head -1)"
      fi
      # Repo hat nur einen Skill im Wurzelordner
      if [[ -z "$quelle" && -f "$d/SKILL.md" ]]; then quelle="$d/SKILL.md"; fi
      if [[ -n "$quelle" ]]; then
        rm -rf "$ZIEL/$skill" && mkdir -p "$ZIEL/$skill" \
          && cp -r "$(dirname "$quelle")/." "$ZIEL/$skill/" && rm -rf "$ZIEL/$skill/.git"
      elif command -v npx >/dev/null && timeout 120 npx -y skills add "https://github.com/$repo" --skill "$skill" -a claude-code -g -y >/dev/null 2>&1; then
        :
      else
        fehler+=" $skill"
      fi
    done
  done
  if [[ -n "$fehler" ]]; then
    echo "$(date '+%F %T') fehlgeschlagen:$fehler" >> "$LOG"
  else
    echo "$(date '+%F %T') ok" >> "$LOG"
  fi
}

if [[ "${1:-}" == "--vordergrund" || "${1:-}" == "--force" ]]; then
  lauf; rm -rf "$ARBEIT"
else
  # Im Hintergrund, damit die Sitzung sofort startet
  ( lauf; rm -rf "$ARBEIT" ) </dev/null >/dev/null 2>&1 &
  disown 2>/dev/null || true
fi
exit 0
