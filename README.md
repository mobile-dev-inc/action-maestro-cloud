# Maestro Cloud Action

Run your Flows on [Maestro Cloud](https://cloud.mobile.dev).

# Using the action

Add the following to your workflow. Note that you can use the `v1` tag if you want to keep using the latest version of the action, which will automatically resolve to all `v1.minor.patch` versions as they get published.

```yaml
- uses: mobile-dev-inc/action-maestro-cloud@v1.8.0
  with:
    api-key: ${{ secrets.MAESTRO_CLOUD_API_KEY }}
    app-file: <path_to_your_app_file>
```

# Triggers

Trigger this action on (1) pushes to your main branch and (2) pull requests opened against your main branch:

```yaml
on:
  push:
    branches: [master]
  pull_request:
    branches: [master]
```

If you need to use the `pull_request_target` trigger to support repo forks, check out the HEAD of the pull request to ensure that you're running the analysis against the changed code:

```yaml
on:
  push:
    branches: [master]
  pull_request_target:
    branches: [master]
jobs:
  upload-to-mobile-dev:
    name: Run Flows on Maestro Cloud
    steps:
      - uses: actions/checkout@v3
        with:
          ref: ${{ github.event.pull_request.head.sha }} # Checkout PR HEAD
```

# Android

```yaml
- uses: mobile-dev-inc/action-maestro-cloud@v1.8.0
  with:
    api-key: ${{ secrets.MAESTRO_CLOUD_API_KEY }}
    app-file: app/build/outputs/apk/debug/app-debug.apk
```

`app-file` should point to an x86 compatible APK file, either directly to the file or a glob pattern matching the file name. When using a pattern, the first matched file will be used.

### Proguard Deobfuscation

Include the Proguard mapping file to deobfuscate Android performance traces:

```yaml
- uses: mobile-dev-inc/action-maestro-cloud@v1.8.0
  with:
    api-key: ${{ secrets.MAESTRO_CLOUD_API_KEY }}
    app-file: app/build/outputs/apk/release/app-release.apk
    mapping-file: app/build/outputs/mapping/release/mapping.txt
```

# iOS

```yaml
- uses: mobile-dev-inc/action-maestro-cloud@v1.8.0
  with:
    api-key: ${{ secrets.MAESTRO_CLOUD_API_KEY }}
    app-file: <app_name>.app
    mapping-file: <app_name>.app.dSYM
```

`app-file` should point to an x86 compatible Simulator .app build, either directly to the file or a glob pattern matching the file name. When using a pattern, the first matched file will be used.

### .dSYM file

```yaml
- uses: mobile-dev-inc/action-maestro-cloud@v1.8.0
  with:
    api-key: ${{ secrets.MAESTRO_CLOUD_API_KEY }}
    app-file: <app_name>.app
    mapping-file: <app_name>.app.dSYM
```

`mapping-file` should point to generated .dSYM file (unique per build). more info [here](https://developer.apple.com/documentation/xcode/building-your-app-to-include-debugging-information).

# Custom workspace location

By default, the action is looking for a `.maestro` folder with Maestro flows in the root directory of the project. If you would like to customize this behaviour, you can override it with a `workspace` argument:

```yaml
- uses: mobile-dev-inc/action-maestro-cloud@v1.8.0
  with:
    api-key: ${{ secrets.MAESTRO_CLOUD_API_KEY }}
    app-file: app.zip
    workspace: myFlows/
```

# Custom name

A name will automatically be provided according to the following order:

1. If it is a Pull Request, use Pull Request title as name
2. If it is a normal push, use commit message as name
3. If for some reason the commit message is not available, use the commit SHA as name

If you want to override this behaviour and specify your own name, you can do so by setting the `name` argument:

```yaml
- uses: mobile-dev-inc/action-maestro-cloud@v1.8.0
  with:
    api-key: ${{ secrets.MAESTRO_CLOUD_API_KEY }}
    app-file: app.zip
    name: My Upload
```

# Run in async mode

If you don't want the action to wait until the Upload has been completed as is the default behaviour, set the `async` argument to `true`:

```yaml
- uses: mobile-dev-inc/action-maestro-cloud@v1.8.0
  with:
    api-key: ${{ secrets.MAESTRO_CLOUD_API_KEY }}
    app-file: app.zip
    async: true
```

Alternatively, you might want to still wait for the action but would like to configure the timeout period, set `timeout` argument to a number of minutes:

```yaml
- uses: mobile-dev-inc/action-maestro-cloud@v1.8.0
  with:
    api-key: ${{ secrets.MAESTRO_CLOUD_API_KEY }}
    app-file: app.zip
    timeout: 90 # Wait for 90 minutes
```

# Adding environment variables

If you want to pass environment variables along with your upload, add a multiline `env` argument:

```yaml
- uses: mobile-dev-inc/action-maestro-cloud@v1.8.0
  with:
    api-key: ${{ secrets.MAESTRO_CLOUD_API_KEY }}
    app-file: app.zip
    env: |
      USERNAME=<username>
      PASSWORD=<password>
```

# Using tags

You can use Maestro (Tags)[https://maestro.mobile.dev/cli/tags] to filter which Flows to send to Maestro Cloud:

You can either pass a single value, or comma-separated (`,`) values.

```yaml
- uses: mobile-dev-inc/action-maestro-cloud@v1.8.0
  with:
    api-key: ${{ secrets.MAESTRO_CLOUD_API_KEY }}
    app-file: app.zip
    include-tags: dev, pull-request
    exclude-tags: excludeTag
```

# Specifying Android API Level

You can specify what Android API level to use when running in Maestro Cloud using the `android-api-level` parameter.

The default API level is 30.

```yaml
- uses: mobile-dev-inc/action-maestro-cloud@v1.8.0
  with:
    api-key: ${{ secrets.MAESTRO_CLOUD_API_KEY }}
    app-file: app.apk
    android-api-level: 29
```

# Specifying iOS version

You can specify what **major** iOS Version to use when running in Maestro Cloud using the `ios-version` parameter.

The default iOS version is 15.

```yaml
- uses: mobile-dev-inc/action-maestro-cloud@v1.8.0
  with:
    api-key: ${{ secrets.MAESTRO_CLOUD_API_KEY }}
    app-file: app.zip
    ios-version: 16
```

# Using an already uploaded App

You can use an already uploaded App binary in Maestro Cloud using the `app-binary-id` parameter.

```yaml
      - id: upload
        uses: mobile-dev-inc/action-maestro-cloud@v1.8.0
        with:
          api-key: ${{ secrets.MAESTRO_CLOUD_API_KEY }}
          app-file: app.zip

      - uses: mobile-dev-inc/action-maestro-cloud@v1.8.0
        with:
          api-key: ${{ secrets.MAESTRO_CLOUD_API_KEY }}
          app-binary-id: ${{ steps.upload.outputs.MAESTRO_CLOUD_APP_BINARY_ID }}
```

# Configuring the locale for the device where the flows will be executed

To switch the device locale on a remote device from a default one (en_US) `device-locale` parameter should be used. The value is a combination of lowercase ISO-639-1 code and uppercase ISO-3166-1 code, i.e. "de_DE" for Germany.

```yaml
- uses: mobile-dev-inc/action-maestro-cloud@v1.8.0
  with:
    api-key: ${{ secrets.MAESTRO_CLOUD_API_KEY }}
    app-file: app.zip
    device-locale: de_DE

```

# Accessing output

The following output variables are set by the action:

- `MAESTRO_CLOUD_CONSOLE_URL` - link to the Maestro Cloud console
- `MAESTRO_CLOUD_UPLOAD_STATUS` - status of the Upload (not available in `async` mode)
- `MAESTRO_CLOUD_FLOW_RESULTS` - list of Flows and their results (not available in `async` mode)
- `MAESTRO_CLOUD_APP_BINARY_ID` - id of the binary uploaded

In order to access these variables you can use the following approach:

```yaml
- id: upload
  uses: mobile-dev-inc/action-maestro-cloud@v1.8.0
  with:
    api-key: ${{ secrets.MAESTRO_CLOUD_API_KEY }}
    app-file: <your_app_file>
    # ... any other parameters

- name: Access Outputs
  if: always()
  run: |
    echo "Console URL: ${{ steps.upload.outputs.MAESTRO_CLOUD_CONSOLE_URL }}"
    echo "Flow Results: ${{ steps.upload.outputs.MAESTRO_CLOUD_FLOW_RESULTS }}"
    echo "Upload Status: ${{ steps.upload.outputs.MAESTRO_CLOUD_UPLOAD_STATUS }}"
    echo "App Binary ID:: ${{ steps.upload.outputs.MAESTRO_CLOUD_APP_BINARY_ID }}"
```
