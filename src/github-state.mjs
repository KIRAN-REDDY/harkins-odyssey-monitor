const STATE_TITLE = 'Harkins Odyssey monitor state — do not delete';
const MARKER = '<!-- HARKINS_ODYSSEY_MONITOR_STATE -->';

function githubHeaders(token) {
  return {
    Accept: 'application/vnd.github+json',
    Authorization: `Bearer ${token}`,
    'X-GitHub-Api-Version': '2022-11-28',
    'Content-Type': 'application/json',
    'User-Agent': 'harkins-odyssey-seat-monitor',
  };
}

async function githubRequest(path, options = {}) {
  const token = process.env.GITHUB_TOKEN;
  const repository = process.env.GITHUB_REPOSITORY;
  if (!token || !repository) return null;
  const response = await fetch(`https://api.github.com/repos/${repository}${path}`, {
    ...options,
    headers: { ...githubHeaders(token), ...(options.headers || {}) },
  });
  if (!response.ok) throw new Error(`GitHub API ${response.status}: ${await response.text()}`);
  if (response.status === 204) return null;
  return response.json();
}

function parseState(body = '') {
  const markerIndex = body.indexOf(MARKER);
  if (markerIndex < 0) return { version: 1, sessions: {} };
  const jsonMatch = body.slice(markerIndex + MARKER.length).match(/```json\s*([\s\S]*?)```/i);
  if (!jsonMatch) return { version: 1, sessions: {} };
  try {
    const parsed = JSON.parse(jsonMatch[1]);
    return { version: 1, sessions: {}, ...parsed };
  } catch {
    return { version: 1, sessions: {} };
  }
}

function serializeState(state) {
  return `${MARKER}\nThis issue stores deduplication state for the seat monitor. Keep the repository private and do not edit this issue manually.\n\n\`\`\`json\n${JSON.stringify(state, null, 2)}\n\`\`\``;
}

export async function loadState() {
  if (!process.env.GITHUB_TOKEN || !process.env.GITHUB_REPOSITORY) {
    console.warn('No GITHUB_TOKEN/GITHUB_REPOSITORY: deduplication state is in-memory only.');
    return { issueNumber: null, state: { version: 1, sessions: {} } };
  }
  const issues = await githubRequest('/issues?state=all&per_page=100');
  const issue = issues.find((item) => item.title === STATE_TITLE && !item.pull_request);
  if (issue) return { issueNumber: issue.number, state: parseState(issue.body) };

  const created = await githubRequest('/issues', {
    method: 'POST',
    body: JSON.stringify({ title: STATE_TITLE, body: serializeState({ version: 1, sessions: {} }) }),
  });
  return { issueNumber: created.number, state: { version: 1, sessions: {} } };
}

export async function saveState(issueNumber, state) {
  if (!issueNumber) return;
  state.updatedAt = new Date().toISOString();
  await githubRequest(`/issues/${issueNumber}`, {
    method: 'PATCH',
    body: JSON.stringify({ body: serializeState(state) }),
  });
}
