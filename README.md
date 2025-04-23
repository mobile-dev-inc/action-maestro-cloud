# Maestro Cloud Action

Run your Flows on [Maestro Cloud](https://app.maestro.dev).

## Using the action

Add the following to your workflow. Note that you can use the `v1` tag if you want to keep using the latest version of the action, which will automatically resolve to all `v1.minor.patch` versions as they get published.

```yaml
- uses: mobile-dev-inc/action-maestro-cloud@v1.9.8
  with:
    api-key: ${{ secrets.MAESTRO_CLOUD_API_KEY }}
    project-id: 'proj_01example0example1example2' # replace this with your actual project id
    app-file: <path_to_your_app_file>
```

## Inputs

| Key                 | Required                 | Description                                                                     |
|---------------------|--------------------------|-------------------------------------------------------------------------------- |
| `api-key`           | Yes                      | Your Maestro Cloud API key                                                      |
| `android-api-level` | No                       | The Android API level to use when running the Flows                             |
| `app-file`          | Yes (or `app-binary-id`) | Path to the app file to upload.                                                 |
| `app-binary-id`     | Yes (or `app-file`)      | The ID of a previously uploaded app-file.                                       |
| `async`             | No                       | Whether to start the flow and exit the action (defaults to `false`)             |
| `env`               | No                       | Environment variables to pass to the run                                        |
| `exclude-tags`      | No                       | Comma-separated list of tags to exclude from the run                            |
| `include-tags`      | No                       | Comma-separated list of tags to include in the run                              |
| `mapping-file`      | No                       | Path to the ProGuard map (Android) or dSYM (iOS)                                |
| `project-id`        | Yes                      | Which project to run the tests against                                          |
| `name`              | No                       | Friendly name of the run                                                        |
| `timeout`           | No                       | How long to wait for the run to complete when not async (defaults to 30 minutes)|
| `workspace`         | No                       | Path to the workspace directory containing the Flows (defaults to `.maestro`)   |
| `device-model`      | No                       | The [device model](https://docs.maestro.dev/cloud/reference/configuring-os-version#using-a-specific-ios-minor-version-and-device-recommended) to use when running the Flows (eg iPhone-11)                   |
| `device-os`         | No                       | The [device OS](https://docs.maestro.dev/cloud/reference/configuring-os-version) to use when running the Flows (eg iOS-16-2)                       |
| `device-locale`     | No                       | The [device locale](https://docs.maestro.dev/cloud/reference/configuring-device-locale) to use when running the Flows (eg en_US)                      |

## Triggers

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

For more information on triggering workflows, check out [GitHub's documentation](https://docs.github.com/en/actions/writing-workflows/choosing-when-your-workflow-runs/events-that-trigger-workflows).

## Android

```yaml
- uses: mobile-dev-inc/action-maestro-cloud@v1.9.8
  with:
    api-key: ${{ secrets.MAESTRO_CLOUD_API_KEY }}
    project-id: 'proj_01example0example1example2'
    app-file: app/build/outputs/apk/debug/app-debug.apk
```

`app-file` should point to an x86 compatible APK file, either directly to the file or a glob pattern matching the file name. When using a pattern, the first matched file will be used.

### ProGuard Deobfuscation

Include the ProGuard mapping file to deobfuscate Android performance traces:

```yaml
- uses: mobile-dev-inc/action-maestro-cloud@v1.9.8
  with:
    api-key: ${{ secrets.MAESTRO_CLOUD_API_KEY }}
    project-id: 'proj_01example0example1example2'
    app-file: app/build/outputs/apk/release/app-release.apk
    mapping-file: app/build/outputs/mapping/release/mapping.txt
```

## iOS

```yaml
- uses: mobile-dev-inc/action-maestro-cloud@v1.9.8
  with:
    api-key: ${{ secrets.MAESTRO_CLOUD_API_KEY }}
    project-id: 'proj_01example0example1example2'
    app-file: <app_name>.app
    mapping-file: <app_name>.app.dSYM
```

`app-file` should point to an .app build (x86 or ARM), either directly to the file or a glob pattern matching the file name. When using a pattern, the first matched file will be used.

### .dSYM file

```yaml
- uses: mobile-dev-inc/action-maestro-cloud@v1.9.8
  with:
    api-key: ${{ secrets.MAESTRO_CLOUD_API_KEY }}
    project-id: 'proj_01example0example1example2'
    app-file: <app_name>.app
    mapping-file: <app_name>.app.dSYM
```

`mapping-file` should point to generated .dSYM file (unique per build). more info [here](https://developer.apple.com/documentation/xcode/building-your-app-to-include-debugging-information).

## Custom workspace location

By default, the action is looking for a `.maestro` folder with Maestro flows in the root directory of the project. If you would like to customize this behaviour, you can override it with a `workspace` argument:

```yaml
- uses: mobile-dev-inc/action-maestro-cloud@v1.9.8
  with:
    api-key: ${{ secrets.MAESTRO_CLOUD_API_KEY }}
    project-id: 'proj_01example0example1example2'
    app-file: app.zip
    workspace: myFlows/
```

## Custom name

A name will automatically be provided according to the following order:

1. If it is a Pull Request, use Pull Request title as name
2. If it is a normal push, use commit message as name
3. If for some reason the commit message is not available, use the commit SHA as name

If you want to override this behaviour and specify your own name, you can do so by setting the `name` argument:

```yaml
- uses: mobile-dev-inc/action-maestro-cloud@v1.9.8
  with:
    api-key: ${{ secrets.MAESTRO_CLOUD_API_KEY }}
    project-id: 'proj_01example0example1example2'
    app-file: app.zip
    name: My Upload
```

## Run in async mode

If you don't want the action to wait until the Upload has been completed as is the default behaviour, set the `async` argument to `true`:

```yaml
- uses: mobile-dev-inc/action-maestro-cloud@v1.9.8
  with:
    api-key: ${{ secrets.MAESTRO_CLOUD_API_KEY }}
    project-id: 'proj_01example0example1example2'
    app-file: app.zip
    async: true
```

Alternatively, you might want to still wait for the action but would like to configure the timeout period, set `timeout` argument to a number of minutes:

```yaml
- uses: mobile-dev-inc/action-maestro-cloud@v1.9.8
  with:
    api-key: ${{ secrets.MAESTRO_CLOUD_API_KEY }}
    project-id: 'proj_01example0example1example2'
    app-file: app.zip
    timeout: 90 # Wait for 90 minutes
```

## Adding environment variables

If you want to pass environment variables along with your upload, add a multiline `env` argument:

```yaml
- uses: mobile-dev-inc/action-maestro-cloud@v1.9.8
  with:
    api-key: ${{ secrets.MAESTRO_CLOUD_API_KEY }}
    project-id: 'proj_01example0example1example2'
    app-file: app.zip
    env: |
      USERNAME=<username>
      PASSWORD=<password>
```

## Using tags

You can use Maestro [Tags](https://maestro.mobile.dev/cli/tags) to filter which Flows to send:

You can either pass a single value, or comma-separated (`,`) values.

```yaml
- uses: mobile-dev-inc/action-maestro-cloud@v1.9.8
  with:
    api-key: ${{ secrets.MAESTRO_CLOUD_API_KEY }}
    project-id: 'proj_01example0example1example2'
    app-file: app.zip
    include-tags: dev, pull-request
    exclude-tags: excludeTag
```

## Specifying Android API Level

You can specify which Android API level to use when running using the `android-api-level` parameter.

On Maestro Cloud, the default API level is 33 (Android 13). [Refer to Maestro Cloud docs](https://docs.maestro.dev/cloud/reference/configuring-os-version) for available Android emulator API levels.

```yaml
- uses: mobile-dev-inc/action-maestro-cloud@v1.9.8
  with:
    api-key: ${{ secrets.MAESTRO_CLOUD_API_KEY }}
    project-id: 'proj_01example0example1example2'
    app-file: app.apk
    android-api-level: 29
```

## Specifying iOS version and device

You can specify which iOS Version to use when running in Maestro Cloud using the `device-os` parameter.

On Maestro Cloud, the default iOS version is 16. [Refer to Maestro Cloud docs](https://docs.maestro.dev/cloud/reference/configuring-os-version) for available iOS simulator versions. On Maestro Cloud, the default iOS version is 16.

```yaml
- uses: mobile-dev-inc/action-maestro-cloud@v1.9.8
  with:
    api-key: ${{ secrets.MAESTRO_CLOUD_API_KEY }}
    project-id: 'proj_01example0example1example2'
    app-file: app.zip
    device-model: iPhone-16
    device-os: iOS-18-2
```

## Using an already uploaded App

You can use an already uploaded binary in Maestro Cloud using the `app-binary-id` parameter.

```yaml
      - id: upload
        uses: mobile-dev-inc/action-maestro-cloud@v1.9.8
        with:
          api-key: ${{ secrets.MAESTRO_CLOUD_API_KEY }}
          project-id: 'proj_01example0example1example2'
          app-file: app.zip

      - uses: mobile-dev-inc/action-maestro-cloud@v1.9.8
        with:
          api-key: ${{ secrets.MAESTRO_CLOUD_API_KEY }}
          project-id: 'proj_01example0example1example2'
          app-binary-id: ${{ steps.upload.outputs.MAESTRO_CLOUD_APP_BINARY_ID }}
```

## Configuring the locale for the device where the flows will be executed

To switch the device locale on a remote device from a default one (en_US) `device-locale` parameter should be used. The value is a combination of lowercase ISO-639-1 code and uppercase ISO-3166-1 code, i.e. "de_DE" for Germany.

```yaml
- uses: mobile-dev-inc/action-maestro-cloud@v1.9.8
  with:
    api-key: ${{ secrets.MAESTRO_CLOUD_API_KEY }}
    project-id: 'proj_01example0example1example2'
    app-file: app.zip
    device-locale: de_DE

```

## Outputs

The following output variables are set by the action:

- `MAESTRO_CLOUD_CONSOLE_URL` - link to the Maestro Cloud console (if using Maestro Cloud)
- `MAESTRO_CLOUD_UPLOAD_STATUS` - status of the Upload (not available in `async` mode)
- `MAESTRO_CLOUD_FLOW_RESULTS` - list of Flows and their results (not available in `async` mode)
- `MAESTRO_CLOUD_APP_BINARY_ID` - id of the binary uploaded (if using Maestro Cloud)

In order to access these variables you can use the following approach:

```yaml
- id: upload
  uses: mobile-dev-inc/action-maestro-cloud@v1.9.8
  with:
    api-key: ${{ secrets.MAESTRO_CLOUD_API_KEY }}
    project-id: 'proj_01example0example1example2'
    app-file: <your_app_file>
    # ... any other parameters

- name: Access Outputs
  if: always()
  run: |
    echo "Console URL: ${{ steps.upload.outputs.MAESTRO_CLOUD_CONSOLE_URL }}"
    echo "Flow Results: ${{ steps.upload.outputs.MAESTRO_CLOUD_FLOW_RESULTS }}"
    echo "Upload Status: ${{ steps.upload.outputs.MAESTRO_CLOUD_UPLOAD_STATUS }}"
    echo "App Binary ID: ${{ steps.upload.outputs.MAESTRO_CLOUD_APP_BINARY_ID }}"
```

### Output types

- `MAESTRO_CLOUD_UPLOAD_STATUS`

  Any of the following values:

  ```plaintext
  PENDING
  PREPARING
  INSTALLING
  RUNNING
  SUCCESS
  ERROR
  CANCELED
  WARNING
  ```

- `MAESTRO_CLOUD_FLOW_RESULTS`

   An array of objects with at least `name`, `status`, and `errors` fields.

   ```json
   [{"name":"my-first-flow","status":"SUCCESS","errors":[]},{"name":"my-second-flow","status":"SUCCESS","errors":[]},{"name":"my-cancelled-flow","status":"CANCELED","errors":[],"cancellationReason":"INFRA_ERROR"}]
   ```
