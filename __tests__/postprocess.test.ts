import { parseJunit } from '../postprocess'

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

  it('parses <error> tags as infra failures', () => {
    const xml = `<testsuites><testsuite>
      <testcase name="login" classname="login" status="ERROR">
        <error>Device unreachable</error>
      </testcase>
    </testsuites></testsuite>`
    expect(parseJunit(xml)).toEqual([
      { name: 'login', status: 'ERROR', errors: ['Device unreachable'] },
    ])
  })

  it('strips CDATA wrappers from failure messages', () => {
    const xml = `<testsuites><testsuite>
      <testcase name="checkout" classname="checkout" status="ERROR">
        <failure><![CDATA[Element <Button> not found]]></failure>
      </testcase>
    </testsuites></testsuite>`
    expect(parseJunit(xml)).toEqual([
      {
        name: 'checkout',
        status: 'ERROR',
        errors: ['Element <Button> not found'],
      },
    ])
  })

  it('strips CDATA wrappers from error messages', () => {
    const xml = `<testsuites><testsuite>
      <testcase name="login" classname="login" status="ERROR">
        <error><![CDATA[connection refused: host=10.0.0.1 port=5555]]></error>
      </testcase>
    </testsuites></testsuite>`
    expect(parseJunit(xml)).toEqual([
      {
        name: 'login',
        status: 'ERROR',
        errors: ['connection refused: host=10.0.0.1 port=5555'],
      },
    ])
  })

  it('captures multiple error elements on a single testcase', () => {
    const xml = `<testsuites><testsuite>
      <testcase name="checkout" classname="checkout" status="ERROR">
        <failure>assertion failed</failure>
        <error>cleanup hook crashed</error>
      </testcase>
    </testsuites></testsuite>`
    expect(parseJunit(xml)).toEqual([
      {
        name: 'checkout',
        status: 'ERROR',
        errors: ['assertion failed', 'cleanup hook crashed'],
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
