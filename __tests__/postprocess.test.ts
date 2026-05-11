import { parseJunit, deriveUploadStatus } from '../postprocess'

describe('parseJunit', () => {
  it('returns empty array for empty XML', () => {
    expect(parseJunit('<testsuites/>')).toEqual([])
  })

  it('parses a single passing testcase', () => {
    const xml = `<testsuites><testsuite>
      <testcase id="login" name="login" classname="login" status="SUCCESS"/>
    </testsuite></testsuites>`
    expect(parseJunit(xml)).toEqual([
      { name: 'login', status: 'SUCCESS', errors: [] },
    ])
  })

  it('parses a failing testcase with failure message', () => {
    const xml = `<testsuites><testsuite>
      <testcase id="checkout" name="checkout" classname="checkout" status="ERROR">
        <failure>Element not found</failure>
      </testcase>
    </testsuite></testsuites>`
    expect(parseJunit(xml)).toEqual([
      {
        name: 'checkout',
        status: 'ERROR',
        errors: ['Element not found'],
      },
    ])
  })

  it('parses mixed pass/fail/warning/cancel/stopped', () => {
    const xml = `<testsuites><testsuite>
      <testcase name="a" classname="a" status="SUCCESS"/>
      <testcase name="b" classname="b" status="ERROR"><failure>boom</failure></testcase>
      <testcase name="c" classname="c" status="WARNING"/>
      <testcase name="d" classname="d" status="CANCELED"/>
      <testcase name="e" classname="e" status="STOPPED"/>
    </testsuite></testsuites>`
    expect(parseJunit(xml)).toEqual([
      { name: 'a', status: 'SUCCESS', errors: [] },
      { name: 'b', status: 'ERROR', errors: ['boom'] },
      { name: 'c', status: 'WARNING', errors: [] },
      { name: 'd', status: 'CANCELED', errors: [] },
      { name: 'e', status: 'STOPPED', errors: [] },
    ])
  })

  it('decodes XML entities in name and failure', () => {
    const xml = `<testsuites><testsuite>
      <testcase name="A &amp; B" classname="A &amp; B" status="ERROR">
        <failure>&lt;div&gt; not found in &quot;page&quot;</failure>
      </testcase>
    </testsuite></testsuites>`
    expect(parseJunit(xml)).toEqual([
      {
        name: 'A & B',
        status: 'ERROR',
        errors: ['<div> not found in "page"'],
      },
    ])
  })

  it('ignores testcases missing name or status', () => {
    const xml = `<testsuites><testsuite>
      <testcase classname="x" status="SUCCESS"/>
      <testcase name="y" classname="y"/>
      <testcase name="z" classname="z" status="SUCCESS"/>
    </testsuite></testsuites>`
    expect(parseJunit(xml)).toEqual([
      { name: 'z', status: 'SUCCESS', errors: [] },
    ])
  })

  it('handles testcases with properties block', () => {
    const xml = `<testsuites><testsuite>
      <testcase name="login" classname="login" status="SUCCESS">
        <properties>
          <property name="testCaseId" value="TC-001"/>
        </properties>
      </testcase>
    </testsuite></testsuites>`
    expect(parseJunit(xml)).toEqual([
      { name: 'login', status: 'SUCCESS', errors: [] },
    ])
  })

  it('preserves multiline failure messages', () => {
    const xml = `<testsuites><testsuite>
      <testcase name="a" classname="a" status="ERROR">
        <failure>line1
line2
line3</failure>
      </testcase>
    </testsuite></testsuites>`
    expect(parseJunit(xml)).toEqual([
      {
        name: 'a',
        status: 'ERROR',
        errors: ['line1\nline2\nline3'],
      },
    ])
  })

  // Defensive: the CLI's emitter currently produces XML-escaped text, not CDATA,
  // but a future format change shouldn't surface CDATA wrappers to users.
  it('unwraps CDATA-wrapped failure messages', () => {
    const xml = `<testsuites><testsuite>
      <testcase name="checkout" classname="checkout" status="ERROR">
        <failure><![CDATA[Element <Button> not found]]></failure>
      </testcase>
    </testsuite></testsuites>`
    expect(parseJunit(xml)).toEqual([
      {
        name: 'checkout',
        status: 'ERROR',
        errors: ['Element <Button> not found'],
      },
    ])
  })

  it('handles flows from multiple testsuites', () => {
    const xml = `<testsuites>
      <testsuite name="suite1">
        <testcase name="a" classname="a" status="SUCCESS"/>
      </testsuite>
      <testsuite name="suite2">
        <testcase name="b" classname="b" status="ERROR"><failure>x</failure></testcase>
      </testsuite>
    </testsuites>`
    expect(parseJunit(xml)).toEqual([
      { name: 'a', status: 'SUCCESS', errors: [] },
      { name: 'b', status: 'ERROR', errors: ['x'] },
    ])
  })
})

describe('deriveUploadStatus', () => {
  it('returns SUCCESS when all flows pass and exit 0', () => {
    expect(
      deriveUploadStatus(
        [
          { name: 'a', status: 'SUCCESS', errors: [] },
          { name: 'b', status: 'SUCCESS', errors: [] },
        ],
        0
      )
    ).toBe('SUCCESS')
  })

  it('returns ERROR when any flow has errors', () => {
    expect(
      deriveUploadStatus(
        [
          { name: 'a', status: 'SUCCESS', errors: [] },
          { name: 'b', status: 'ERROR', errors: ['boom'] },
        ],
        1
      )
    ).toBe('ERROR')
  })

  it('returns ERROR when any flow status is ERROR even with empty errors[]', () => {
    expect(
      deriveUploadStatus(
        [{ name: 'a', status: 'ERROR', errors: [] }],
        1
      )
    ).toBe('ERROR')
  })

  it('returns CANCELED when no errors but a flow is cancelled', () => {
    expect(
      deriveUploadStatus(
        [
          { name: 'a', status: 'SUCCESS', errors: [] },
          { name: 'b', status: 'CANCELED', errors: [] },
        ],
        1
      )
    ).toBe('CANCELED')
  })

  it('returns STOPPED when no errors but a flow is stopped', () => {
    expect(
      deriveUploadStatus(
        [
          { name: 'a', status: 'SUCCESS', errors: [] },
          { name: 'b', status: 'STOPPED', errors: [] },
        ],
        1
      )
    ).toBe('STOPPED')
  })

  it('returns WARNING when no errors/cancels/stopped but a flow is warning', () => {
    expect(
      deriveUploadStatus(
        [
          { name: 'a', status: 'SUCCESS', errors: [] },
          { name: 'b', status: 'WARNING', errors: [] },
        ],
        0
      )
    ).toBe('WARNING')
  })

  it('returns ERROR for non-zero exit with no flows', () => {
    expect(deriveUploadStatus([], 1)).toBe('ERROR')
  })

  it('returns SUCCESS for zero exit with no flows', () => {
    expect(deriveUploadStatus([], 0)).toBe('SUCCESS')
  })

  it('errors[] takes precedence over CANCELED', () => {
    expect(
      deriveUploadStatus(
        [
          { name: 'a', status: 'CANCELED', errors: [] },
          { name: 'b', status: 'ERROR', errors: ['oops'] },
        ],
        1
      )
    ).toBe('ERROR')
  })

  it('STOPPED takes precedence over CANCELED', () => {
    expect(
      deriveUploadStatus(
        [
          { name: 'a', status: 'CANCELED', errors: [] },
          { name: 'b', status: 'STOPPED', errors: [] },
        ],
        1
      )
    ).toBe('STOPPED')
  })
})
