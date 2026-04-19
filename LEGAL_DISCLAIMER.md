# Legal Disclaimer

**Search Party** is a local, open-source tool — **not** a hosted service. By using this software, you acknowledge the following:

## Your data stays on your machine

Your resume, contact information, career history, and all other personal data are stored locally in the `search/` directory. Nothing is uploaded to Search Party's developers — we do not collect, store, or have access to any of your data.

However, when agents perform web searches, score job descriptions, or generate content, your data is sent to **Anthropic's API** (Claude) for processing. Review [Anthropic's privacy policy](https://www.anthropic.com/privacy) and [terms of service](https://www.anthropic.com/terms) to understand how your data is handled by the AI provider.

## AI agents can take actions

Search Party's agents are ephemeral Claude Code sessions that can read files, write files, and search the web on your behalf. The default agent directives are designed to keep humans in the loop — agents do **not** auto-submit job applications.

That said, AI models can behave unpredictably. If you modify agent directives (`.claude/agents/`), skill definitions (`.claude/skills/`), or use different models, you do so at your own risk. **Always review AI-generated content before submitting it to employers.**

## Third-party terms of service

You are responsible for using this tool in compliance with the Terms of Service of any platform you interact with, including but not limited to:

- **Job boards and ATS platforms** (Greenhouse, Lever, Workday, LinkedIn, Indeed)
- **Professional networks** (LinkedIn)
- **AI providers** (Anthropic)

Do not use this tool to spam employers, overwhelm applicant tracking systems, or send automated messages at scale without human review.

## No guarantees

- **Fit scores** are estimates, not guarantees of interview outcomes.
- **Salary research** reflects publicly available data that may be outdated or inaccurate.
- **Resume tailoring** and **cover letters** may contain errors or overstate qualifications — review carefully.
- **Company research** may include outdated information or AI-generated inaccuracies.
- **Interview prep** and **mock interview scores** are practice aids, not predictors of performance.

AI models can hallucinate skills, experience, or company details. You are responsible for verifying all AI-generated content before use.

## Limitation of liability

The authors and contributors of Search Party are **not liable** for:

- Employment outcomes (positive or negative)
- Rejected applications
- Account restrictions on job boards or professional networks
- Inaccurate information in AI-generated content
- Data sent to AI providers during normal operation
- Any other consequences arising from use of this software

## License

This software is provided under the **GNU Affero General Public License v3.0** (AGPL-3.0). It is distributed in the hope that it will be useful, but **without any warranty**; without even the implied warranty of merchantability or fitness for a particular purpose. See [LICENSE](LICENSE) for the full license text.
