/**
 * @license Copyright 2021 The Lighthouse Authors. All Rights Reserved.
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License. You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 * Unless required by applicable law or agreed to in writing, software distributed under the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the License for the specific language governing permissions and limitations under the License.
 */

import {jest} from '@jest/globals';

import InspectorIssues from '../../../gather/gatherers/inspector-issues.js';
import NetworkRequest from '../../../lib/network-request.js';
import {createMockContext} from '../../fraggle-rock/gather/mock-driver.js';
import {flushAllTimersAndMicrotasks} from '../../test-utils.js';
import networkRecordsToDevtoolsLog from '../../network-records-to-devtools-log.js';

jest.useFakeTimers();

/**
 * @param {Partial<LH.Artifacts.NetworkRequest>=} partial
 * @return {LH.Artifacts.NetworkRequest}
 */
function mockRequest(partial) {
  return Object.assign(new NetworkRequest(), {
    url: 'https://example.com',
    documentURL: 'https://example.com',
    finished: true,
    frameId: 'frameId',
    isSecure: true,
    isValid: true,
    parsedURL: {scheme: 'https'},
    protocol: 'http/1.1',
    requestMethod: 'GET',
    resourceType: 'Document',
    ...partial,
  });
}

/**
 * @param {Partial<LH.Crdp.Audits.MixedContentIssueDetails>=} details
 * @return {LH.Crdp.Audits.InspectorIssue} partial
 */
function mockMixedContent(details) {
  return {
    code: 'MixedContentIssue',
    details: {
      mixedContentIssueDetails: {
        resolutionStatus: 'MixedContentBlocked',
        insecureURL: 'https://example.com',
        mainResourceURL: 'https://example.com',
        ...details,
      },
    },
  };
}

/**
 * @param {Partial<LH.Crdp.Audits.CookieIssueDetails>=} details
 * @return {LH.Crdp.Audits.InspectorIssue} partial
 */
function mockCookie(details) {
  return {
    code: 'CookieIssue',
    details: {
      cookieIssueDetails: {
        cookie: {
          name: 'name',
          path: 'path',
          domain: 'domain',
        },
        cookieWarningReasons: [],
        cookieExclusionReasons: [],
        operation: 'ReadCookie',
        ...details,
      },
    },
  };
}

/**
 * @param {Partial<LH.Crdp.Audits.BlockedByResponseIssueDetails>=} details
 * @return {LH.Crdp.Audits.InspectorIssue} partial
 */
function mockBlockedByResponse(details) {
  return {
    code: 'BlockedByResponseIssue',
    details: {
      blockedByResponseIssueDetails: {
        request: {requestId: '1'},
        reason: 'CorpNotSameOrigin',
        ...details,
      },
    },
  };
}

/**
 * @param {Partial<LH.Crdp.Audits.HeavyAdIssueDetails>=} details
 * @return {LH.Crdp.Audits.InspectorIssue} partial
 */
function mockHeavyAd(details) {
  return {
    code: 'HeavyAdIssue',
    details: {
      heavyAdIssueDetails: {
        resolution: 'HeavyAdBlocked',
        reason: 'CpuPeakLimit',
        frame: {
          frameId: 'frameId',
        },
        ...details,
      },
    },
  };
}

/**
 * @param {Partial<LH.Crdp.Audits.ContentSecurityPolicyIssueDetails>=} details
 * @return {LH.Crdp.Audits.InspectorIssue} partial
 */
function mockCSP(details) {
  return {
    code: 'ContentSecurityPolicyIssue',
    details: {
      contentSecurityPolicyIssueDetails: {
        violatedDirective: 'default-drc',
        isReportOnly: false,
        contentSecurityPolicyViolationType: 'kInlineViolation',
        ...details,
      },
    },
  };
}

/**
 * @param {string} text
 * @return {LH.Crdp.Audits.InspectorIssue}
 */
function mockDeprecation(text) {
  return {
    code: 'DeprecationIssue',
    details: {
      deprecationIssueDetails: {
        message: text,
        deprecationType: 'test',
        type: 'Untranslated',
        sourceCodeLocation: {
          url: 'https://www.example.com',
          lineNumber: 10,
          columnNumber: 10,
        },
      },
    },
  };
}

describe('instrumentation', () => {
  it('collects inspector issues', async () => {
    const mockContext = createMockContext();
    const mockMixedContentIssue = mockMixedContent({resourceType: 'Audio'});
    const mockCookieIssue =
      mockCookie({cookieWarningReasons: ['WarnSameSiteNoneInsecure']});
    mockContext.driver.defaultSession.on
      .mockEvent('Audits.issueAdded', {issue: mockMixedContentIssue})
      .mockEvent('Audits.issueAdded', {issue: mockCookieIssue});
    mockContext.driver.defaultSession.sendCommand
      .mockResponse('Audits.enable')
      .mockResponse('Audits.disable');
    const gatherer = new InspectorIssues();

    await gatherer.startInstrumentation(mockContext.asContext());
    await flushAllTimersAndMicrotasks();
    await gatherer.stopInstrumentation(mockContext.asContext());

    expect(gatherer._issues).toEqual([
      mockMixedContentIssue,
      mockCookieIssue,
    ]);
  });
});

describe('_getArtifact', () => {
  it('handles multiple types of inspector issues', async () => {
    const gatherer = new InspectorIssues();
    gatherer._issues = [
      mockMixedContent({request: {requestId: '1'}}),
      mockCookie({request: {requestId: '2'}}),
      mockBlockedByResponse({request: {requestId: '3'}}),
      mockHeavyAd(),
      mockCSP(),
      mockDeprecation('some warning'),
    ];
    const networkRecords = [
      mockRequest({requestId: '1'}),
      mockRequest({requestId: '2'}),
      mockRequest({requestId: '3'}),
    ];

    const artifact = await gatherer._getArtifact(networkRecords);

    expect(artifact).toEqual({
      mixedContentIssue: [{
        request: {requestId: '1'},
        resolutionStatus: 'MixedContentBlocked',
        insecureURL: 'https://example.com',
        mainResourceURL: 'https://example.com',
      }],
      cookieIssue: [{
        request: {requestId: '2'},
        cookie: {
          name: 'name',
          path: 'path',
          domain: 'domain',
        },
        cookieWarningReasons: [],
        cookieExclusionReasons: [],
        operation: 'ReadCookie',
      }],
      blockedByResponseIssue: [{
        request: {requestId: '3'},
        reason: 'CorpNotSameOrigin',
      }],
      heavyAdIssue: [{
        resolution: 'HeavyAdBlocked',
        reason: 'CpuPeakLimit',
        frame: {
          frameId: 'frameId',
        },
      }],
      contentSecurityPolicyIssue: [{
        violatedDirective: 'default-drc',
        isReportOnly: false,
        contentSecurityPolicyViolationType: 'kInlineViolation',
      }],
      deprecationIssue: [{
        message: 'some warning',
        deprecationType: 'test',
        sourceCodeLocation: {
          url: 'https://www.example.com',
          columnNumber: 10,
          lineNumber: 10,
        },
        type: 'Untranslated',
      }],
      attributionReportingIssue: [],
      clientHintIssue: [],
      corsIssue: [],
      genericIssue: [],
      lowTextContrastIssue: [],
      navigatorUserAgentIssue: [],
      quirksModeIssue: [],
      sharedArrayBufferIssue: [],
      twaQualityEnforcement: [],
      federatedAuthRequestIssue: [],
    });
  });

  it('dedupe by request id', async () => {
    const gatherer = new InspectorIssues();
    gatherer._issues = [
      mockMixedContent({request: {requestId: '1'}}),
      mockMixedContent({request: {requestId: '2'}}),
      mockCookie({request: {requestId: '3'}}),
      mockCookie({request: {requestId: '4'}}),
      mockBlockedByResponse({request: {requestId: '5'}}),
      mockBlockedByResponse({request: {requestId: '6'}}),
    ];
    const networkRecords = [
      mockRequest({requestId: '1'}),
      mockRequest({requestId: '3'}),
      mockRequest({requestId: '5'}),
    ];

    const artifact = await gatherer._getArtifact(networkRecords);

    expect(artifact).toEqual({
      mixedContentIssue: [{
        request: {requestId: '1'},
        resolutionStatus: 'MixedContentBlocked',
        insecureURL: 'https://example.com',
        mainResourceURL: 'https://example.com',
      }],
      cookieIssue: [{
        request: {requestId: '3'},
        cookie: {
          name: 'name',
          path: 'path',
          domain: 'domain',
        },
        cookieWarningReasons: [],
        cookieExclusionReasons: [],
        operation: 'ReadCookie',
      }],
      blockedByResponseIssue: [{
        request: {requestId: '5'},
        reason: 'CorpNotSameOrigin',
      }],
      heavyAdIssue: [],
      clientHintIssue: [],
      contentSecurityPolicyIssue: [],
      deprecationIssue: [],
      attributionReportingIssue: [],
      corsIssue: [],
      genericIssue: [],
      lowTextContrastIssue: [],
      navigatorUserAgentIssue: [],
      quirksModeIssue: [],
      sharedArrayBufferIssue: [],
      twaQualityEnforcement: [],
      federatedAuthRequestIssue: [],
    });
  });
});

describe('FR compat', () => {
  let mockContext = createMockContext();
  /** @type {InspectorIssues} */
  let gatherer;
  /** @type {LH.Artifacts.NetworkRequest[]} */
  let networkRecords;
  /** @type {LH.DevtoolsLog} */
  let devtoolsLog;

  beforeEach(() => {
    gatherer = new InspectorIssues();
    mockContext = createMockContext();
    mockContext.driver.defaultSession.sendCommand
      .mockResponse('Audits.enable')
      .mockResponse('Audits.disable');
    mockContext.driver.defaultSession.on
      .mockEvent('Audits.issueAdded', {
        issue: mockMixedContent({request: {requestId: '1'}}),
      });
    networkRecords = [
      mockRequest({requestId: '1'}),
    ];
    devtoolsLog = networkRecordsToDevtoolsLog(networkRecords);
  });

  it('uses loadData in legacy mode', async () => {
    const loadData = {
      devtoolsLog,
      networkRecords,
    };
    await gatherer.beforePass(mockContext.asLegacyContext());
    await flushAllTimersAndMicrotasks();

    const artifact = await gatherer.afterPass(mockContext.asLegacyContext(), loadData);

    expect(artifact).toEqual({
      mixedContentIssue: [{
        request: {requestId: '1'},
        resolutionStatus: 'MixedContentBlocked',
        insecureURL: 'https://example.com',
        mainResourceURL: 'https://example.com',
      }],
      cookieIssue: [],
      blockedByResponseIssue: [],
      heavyAdIssue: [],
      clientHintIssue: [],
      contentSecurityPolicyIssue: [],
      deprecationIssue: [],
      attributionReportingIssue: [],
      corsIssue: [],
      genericIssue: [],
      lowTextContrastIssue: [],
      navigatorUserAgentIssue: [],
      quirksModeIssue: [],
      sharedArrayBufferIssue: [],
      twaQualityEnforcement: [],
      federatedAuthRequestIssue: [],
    });
  });

  it('uses dependencies in FR', async () => {
    const context = {
      ...mockContext.asContext(),
      dependencies: {DevtoolsLog: devtoolsLog},
    };
    await gatherer.startInstrumentation(context);
    await flushAllTimersAndMicrotasks();
    await gatherer.stopInstrumentation(context);

    const artifact = await gatherer.getArtifact(context);

    expect(artifact).toEqual({
      mixedContentIssue: [{
        request: {requestId: '1'},
        resolutionStatus: 'MixedContentBlocked',
        insecureURL: 'https://example.com',
        mainResourceURL: 'https://example.com',
      }],
      cookieIssue: [],
      blockedByResponseIssue: [],
      clientHintIssue: [],
      heavyAdIssue: [],
      contentSecurityPolicyIssue: [],
      deprecationIssue: [],
      attributionReportingIssue: [],
      corsIssue: [],
      genericIssue: [],
      lowTextContrastIssue: [],
      navigatorUserAgentIssue: [],
      quirksModeIssue: [],
      sharedArrayBufferIssue: [],
      twaQualityEnforcement: [],
      federatedAuthRequestIssue: [],
    });
  });
});
