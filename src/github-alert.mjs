function githubHeaders(token) {
  return {
    Accept: 'application/vnd.github+json',
    Authorization: `Bearer ${token}`,
    'X-GitHub-Api-Version': '2022-11-28',
    'Content-Type': 'application/json',
    'User-Agent': 'harkins-odyssey-seat-monitor',
  };
}

async function createIssue(payload) {
  const token = process.env.GITHUB_TOKEN;
  const repository = process.env.GITHUB_REPOSITORY;
  if (!token || !repository) return null;

  const response = await fetch(`https://api.github.com/repos/${repository}/issues`, {
    method: 'POST',
    headers: githubHeaders(token),
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const details = await response.text();
    const error = new Error(`GitHub issue creation failed (${response.status}): ${details}`);
    error.status = response.status;
    throw error;
  }

  return response.json();
}

export async function sendGitHubAlert({ title, body }) {
  const token = process.env.GITHUB_TOKEN;
  const repository = process.env.GITHUB_REPOSITORY;
  const username = process.env.ALERT_GITHUB_USER;

  if (!token || !repository || !username) {
    console.warn(
      'GitHub alert settings are missing. Required: GITHUB_TOKEN, GITHUB_REPOSITORY, ALERT_GITHUB_USER. Alert follows:\n',
      body,
    );
    return false;
  }

  const issueBody = [
    `@${username}`,
    '',
    body,
    '',
    '_Created automatically by the Harkins Odyssey seat monitor. The monitor never holds or purchases seats._',
  ].join('\n');

  let issue;
  try {
    issue = await createIssue({
      title,
      body: issueBody,
      assignees: [username],
    });
  } catch (error) {
    // Assignment can fail if the configured username is not assignable. The
    // @mention still provides the notification path, so retry without it.
    if (error.status !== 422) throw error;
    console.warn(`Could not assign @${username}; retrying with an @mention only.`);
    issue = await createIssue({ title, body: issueBody });
  }

  console.log(`GitHub alert issue created: ${issue.html_url}`);
  return true;
}
