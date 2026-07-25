# Security Policy

We take the security and privacy of this project — and of the people who use it —
seriously. This is a wellbeing-oriented application, so please treat any issue that
could expose personal or sensitive data as high priority.

## Supported versions

Security fixes are applied to the latest released version on the `main` branch.
Older snapshots are not maintained.

## Reporting a vulnerability

**Please do not open a public issue for security vulnerabilities.**

Instead, report privately through GitHub's
[private vulnerability reporting](https://docs.github.com/en/code-security/security-advisories/guidance-on-reporting-and-writing-information-about-vulnerabilities/privately-reporting-a-security-vulnerability)
— the **Security → Report a vulnerability** button on this repository.

If that button is not available to you, open a regular issue containing **only**
a request to be contacted about a security matter — no details, no reproduction
steps — and a maintainer will arrange a private channel.

When reporting, please include:

- A description of the issue and its potential impact.
- Steps to reproduce (proof of concept if available).
- Affected component, version or commit.
- Any suggested remediation, if you have one.

We aim to acknowledge reports within a few business days and will keep you informed
as we work on a fix. Please give us a reasonable window to release a patch before
any public disclosure. We are happy to credit reporters who wish to be acknowledged.

## Scope

Examples of issues we care about:

- Authentication or authorization bypass.
- Exposure of personal, health-adjacent or otherwise sensitive user data.
- Injection (SQL, command, template) and remote code execution.
- Secrets or credentials leaking through code, logs or configuration.

## Handling secrets

Never commit real secrets. Use `.env` (git-ignored) for local configuration and keep
`.env.example` as the documented, secret-free template. The backend refuses to start
with a placeholder `JWT_SECRET`, and CI runs an automated secret scan on every push.
