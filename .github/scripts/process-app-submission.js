const fs = require('fs');

/**
 * Processes an app submission issue and creates a PR
 */
class AppSubmissionProcessor {
  constructor(github, context) {
    this.github = github;
    this.context = context;
    this.issue = context.payload.issue;
    this.issueBody = this.issue.body;
  }

  /**
   * Extract a single-line value from the issue body
   */
  extractValue(fieldName) {
    const regex = new RegExp(`### ${fieldName}\\s*\\n\\s*([^\\n]+)`, 'i');
    const match = this.issueBody.match(regex);
    return match ? match[1].trim() : '';
  }

  /**
   * Extract a multi-line value from the issue body
   */
  extractMultilineValue(fieldName) {
    const regex = new RegExp(`### ${fieldName}\\s*\\n\\s*([\\s\\S]*?)(?=\\n### |$)`, 'i');
    const match = this.issueBody.match(regex);
    return match ? match[1].trim() : '';
  }

  /**
   * Extract selected categories from the dropdown
   */
  extractCategories() {
    const categoriesSection = this.extractMultilineValue('Categories');
    if (!categoriesSection) return [];
    
    const lines = categoriesSection.split('\n');
    const categories = [];
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed && !trimmed.includes('_No response_') && !trimmed.includes('Select the categories')) {
        // Remove any markdown formatting
        const category = trimmed.replace(/^-\s*/, '').replace(/^\*\s*/, '').trim();
        if (category) {
          categories.push(category);
        }
      }
    }
    return categories;
  }

  /**
   * Extract anti-features list
   */
  extractAntiFeatures() {
    const antiFeaturesText = this.extractMultilineValue('Anti-Features \\(Optional\\)');
    if (!antiFeaturesText || antiFeaturesText.includes('_No response_')) return [];
    
    return antiFeaturesText.split('\n')
      .map(line => line.trim())
      .filter(line => line && !line.includes('_No response_'));
  }

  /**
   * Parse all fields from the issue
   */
  parseIssueData() {
    return {
      appId: this.extractValue('App ID'),
      gitUrl: this.extractValue('GitHub Repository URL'),
      appName: this.extractValue('App Name'),
      description: this.extractMultilineValue('App Description'),
      categories: this.extractCategories(),
      author: this.extractValue('Author Name \\(Optional\\)'),
      license: this.extractValue('License \\(Optional\\)'),
      website: this.extractValue('Website \\(Optional\\)'),
      tracker: this.extractValue('Issue Tracker \\(Optional\\)'),
      antiFeatures: this.extractAntiFeatures()
    };
  }

  /**
   * Validate required fields
   */
  validateData(data) {
    const errors = [];
    
    if (!data.appId) errors.push('App ID is missing');
    if (!data.gitUrl) errors.push('GitHub Repository URL is missing');
    if (!data.appName) errors.push('App Name is missing');
    if (!data.description) errors.push('Description is missing');
    if (data.categories.length === 0) errors.push('At least one category must be selected');
    
    // Validate GitHub URL format
    if (data.gitUrl && !data.gitUrl.match(/^https:\/\/github\.com\/[^\/]+\/[^\/]+\/?$/)) {
      errors.push(`Invalid GitHub URL format: "${data.gitUrl}"`);
    }
    
    return errors;
  }

  /**
   * Generate YAML entry for the app
   */
  generateYamlEntry(data) {
    let yamlEntry = `${data.appId}:\n`;
    yamlEntry += `  git: ${data.gitUrl}\n`;
    yamlEntry += `  name: "${data.appName}"\n`;
    yamlEntry += `  description: |\n`;
    
    // Format description with proper indentation
    const descriptionLines = data.description.split('\n');
    for (const line of descriptionLines) {
      yamlEntry += `    ${line}\n`;
    }
    
    // Add categories
    if (data.categories.length > 0) {
      yamlEntry += `  categories:\n`;
      for (const category of data.categories) {
        yamlEntry += `    - ${category}\n`;
      }
    }
    
    // Add optional fields
    if (data.author && !data.author.includes('_No response_')) {
      yamlEntry += `  author: "${data.author}"\n`;
    }
    if (data.license && !data.license.includes('_No response_')) {
      yamlEntry += `  license: "${data.license}"\n`;
    }
    if (data.website && !data.website.includes('_No response_')) {
      yamlEntry += `  website: ${data.website}\n`;
    }
    if (data.tracker && !data.tracker.includes('_No response_')) {
      yamlEntry += `  tracker: ${data.tracker}\n`;
    }
    if (data.antiFeatures.length > 0) {
      yamlEntry += `  anti_features:\n`;
      for (const feature of data.antiFeatures) {
        yamlEntry += `    - ${feature}\n`;
      }
    }
    
    return yamlEntry;
  }

  /**
   * Comment on the issue with an error message
   */
  async commentError(message) {
    await this.github.rest.issues.createComment({
      owner: this.context.repo.owner,
      repo: this.context.repo.repo,
      issue_number: this.issue.number,
      body: message
    });
  }

  /**
   * Check if app already exists in apps.yaml
   */
  async checkForDuplicate(appId) {
    try {
      const { data } = await this.github.rest.repos.getContent({
        owner: this.context.repo.owner,
        repo: this.context.repo.repo,
        path: 'apps.yaml'
      });
      const appsYamlContent = Buffer.from(data.content, 'base64').toString();
      return appsYamlContent.includes(`${appId}:`);
    } catch (error) {
      console.log('Could not fetch apps.yaml:', error);
      return false;
    }
  }

  /**
   * Create a new branch and update apps.yaml
   */
  async createPullRequest(data, yamlEntry) {
    const branchName = `add-app-${data.appId}-${Date.now()}`;
    
    // Get current apps.yaml content and SHA
    let appsYamlContent = '';
    let appsYamlSha = null;
    try {
      const { data: fileData } = await this.github.rest.repos.getContent({
        owner: this.context.repo.owner,
        repo: this.context.repo.repo,
        path: 'apps.yaml'
      });
      appsYamlContent = Buffer.from(fileData.content, 'base64').toString();
      appsYamlSha = fileData.sha;
    } catch (error) {
      console.log('Could not fetch apps.yaml:', error);
      // If apps.yaml doesn't exist, we'll create it
      appsYamlContent = '';
      appsYamlSha = null;
    }
    
    // Append new app to apps.yaml
    const newAppsYamlContent = appsYamlContent + '\n' + yamlEntry;
    
    // Get the default branch info
    const defaultBranchName = this.context.payload.repository.default_branch || 'main';
    const { data: defaultBranch } = await this.github.rest.repos.getBranch({
      owner: this.context.repo.owner,
      repo: this.context.repo.repo,
      branch: defaultBranchName
    });
    
    // Create new branch
    await this.github.rest.git.createRef({
      owner: this.context.repo.owner,
      repo: this.context.repo.repo,
      ref: `refs/heads/${branchName}`,
      sha: defaultBranch.commit.sha
    });
    
    // Update apps.yaml in the new branch
    const updateParams = {
      owner: this.context.repo.owner,
      repo: this.context.repo.repo,
      path: 'apps.yaml',
      message: `Add ${data.appName} (${data.appId}) to F-Droid repository

Automatically generated from issue #${this.issue.number}

App details:
- Name: ${data.appName}
- Repository: ${data.gitUrl}
- Categories: ${data.categories.join(', ')}`,
      content: Buffer.from(newAppsYamlContent).toString('base64'),
      branch: branchName
    };
    
    // Add SHA if file exists (for updates)
    if (appsYamlSha) {
      updateParams.sha = appsYamlSha;
    }
    
    await this.github.rest.repos.createOrUpdateFileContents(updateParams);
    
    // Create pull request
    const { data: pr } = await this.github.rest.pulls.create({
      owner: this.context.repo.owner,
      repo: this.context.repo.repo,
      title: `Add ${data.appName} to F-Droid repository`,
      head: branchName,
      base: defaultBranchName,
      body: this.generatePRDescription(data)
    });
    
    return pr;
  }

  /**
   * Generate PR description
   */
  generatePRDescription(data) {
    let description = `## New App Submission: ${data.appName}

This PR was automatically generated from issue #${this.issue.number}.

### App Details
- **App ID:** \`${data.appId}\`
- **Name:** ${data.appName}
- **Repository:** ${data.gitUrl}
- **Categories:** ${data.categories.join(', ')}`;

    if (data.author && !data.author.includes('_No response_')) {
      description += `\n- **Author:** ${data.author}`;
    }
    if (data.license && !data.license.includes('_No response_')) {
      description += `\n- **License:** ${data.license}`;
    }
    if (data.website && !data.website.includes('_No response_')) {
      description += `\n- **Website:** ${data.website}`;
    }
    if (data.tracker && !data.tracker.includes('_No response_')) {
      description += `\n- **Issue Tracker:** ${data.tracker}`;
    }

    description += `\n\n### Description\n${data.description}`;

    if (data.antiFeatures.length > 0) {
      description += `\n\n### Anti-Features\n${data.antiFeatures.map(f => `- ${f}`).join('\n')}`;
    }

    description += `\n\n---

**Submitted by:** @${this.issue.user.login}
**Original Issue:** #${this.issue.number}

### Review Checklist
- [ ] App is FOSS
- [ ] GitHub repository has releases with APK files
- [ ] App metadata is accurate
- [ ] Categories are appropriate
- [ ] No duplicate app ID

/cc @${this.issue.user.login}`;

    return description;
  }

  /**
   * Comment on the issue with success message
   */
  async commentSuccess(prNumber) {
    await this.github.rest.issues.createComment({
      owner: this.context.repo.owner,
      repo: this.context.repo.repo,
      issue_number: this.issue.number,
      body: `Submission Processed Successfully!
      
Your app submission has been processed and a Pull Request has been created: #${prNumber}

**Next Steps:**
1. The maintainers will review your submission
2. You may be asked to make changes if needed
3. Once approved, your app will be available in the F-Droid repository!

You can track the progress in PR #${prNumber}.

Thank you for contributing to the FOSS BU Community!`
    });
  }

  /**
   * Add labels to the issue
   */
  async addLabels() {
    await this.github.rest.issues.addLabels({
      owner: this.context.repo.owner,
      repo: this.context.repo.repo,
      issue_number: this.issue.number,
      labels: ['processed', 'pending-review']
    });
  }

  /**
   * Main processing function
   */
  async process() {
    try {
      // Parse issue data
      const data = this.parseIssueData();
      
      // Validate data
      const errors = this.validateData(data);
      if (errors.length > 0) {
        await this.commentError(`Submission Error

Some required fields are missing or invalid:
${errors.map(error => `- ${error}`).join('\n')}

Please edit your issue to provide all required information.`);
        return;
      }
      
      // Check for duplicates
      const isDuplicate = await this.checkForDuplicate(data.appId);
      if (isDuplicate) {
        await this.commentError(`App Already Exists

An app with the ID "${data.appId}" already exists in the repository.
Please choose a different App ID or check if this is a duplicate submission.`);
        return;
      }
      
      // Generate YAML entry
      const yamlEntry = this.generateYamlEntry(data);
      
      // Create PR
      const pr = await this.createPullRequest(data, yamlEntry);
      
      // Comment success and add labels
      await this.commentSuccess(pr.number);
      await this.addLabels();
      
    } catch (error) {
      console.error('Error processing submission:', error);
      await this.commentError(`Processing Error

An error occurred while processing your submission. Please try again or contact the maintainers.

Error details: ${error.message}`);
    }
  }
}

module.exports = async ({ github, context }) => {
  const processor = new AppSubmissionProcessor(github, context);
  await processor.process();
};