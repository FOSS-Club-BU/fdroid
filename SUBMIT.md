# How to Submit Your App to the FOSS BU Community Repo

Welcome! We welcome all FOSS Android apps. Follow these steps to get your app published:

## 1. Fork this repository

Click the "Fork" button at the top right of this page to create your own copy.

## 2. Add your app to `apps.yaml`

- Open the `apps.yaml` file in the root of the repository.
- Add a new entry for your app using the following format:

  ```yaml
  yourappid:
    git: https://github.com/yourusername/yourapprepo
    name: "Your App Name"
    description: |
      A short description of your app.
      You can use multiple lines.
    categories:
      - Category1
      - Category2
    # Optional metadata fields:
    # author: Your Name or Organization
    # license: SPDX license identifier (e.g., GPL-3.0)
    # website: https://yourappwebsite.com
    # tracker: https://yourapptracker.com
    # source: https://github.com/yourusername/yourapprepo
    # Any other fields supported by the tool (see below for more)
  ```

- Replace `yourappid` with a unique key (usually your app's package name or a short identifier).
- Fill in the `git`, `name`, `description`, and `categories` fields. You can look at existing entries for examples.
- You do **not** need to add your APK file. The automation will fetch APKs from your GitHub releases if your repo is public and has APK assets.

**Important:** Your app's GitHub repository must have published releases that include the APK file as a release asset. The automation will only pick up APKs from GitHub releases (not from source or other locations).

## 3. (Optional) Add extra metadata

- You can include additional fields in your `apps.yaml` entry, such as:
  - `author`: Your name or organization
  - `license`: SPDX license identifier (e.g., GPL-3.0)
  - `website`: App website
  - `tracker`: Issue tracker URL
  - `source`: Source code URL
  - `changelog`: (if you want to link to a changelog)
- For screenshots: Place screenshot files in your app's GitHub repo with `screenshot` in the filename/path. These will be picked up automatically.
- For changelogs: The body of your GitHub releases will be used as the changelog.



## 4. Commit and push your changes

- Commit your new/edited files.
- Push to your fork.

## 5. Open a Pull Request


## 6. Wait for review

- The maintainers will review your submission.
- If changes are needed, you'll get feedback in the PR.
- Once approved, your app will be published in the repo!

## Tips

- Make sure your app is FOSS (Free and Open Source Software).
- Keep your metadata accurate and up to date.
- If you need help, open an issue or ask in the PR.

---

Thank you for contributing to the FOSS BU Community Repo!
