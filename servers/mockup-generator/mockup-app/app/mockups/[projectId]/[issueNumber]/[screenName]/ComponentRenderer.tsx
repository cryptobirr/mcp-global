'use client';

import dynamic from 'next/dynamic';
import { Suspense } from 'react';

interface ComponentRendererProps {
  projectId: string;
  issueNumber: string;
  screenName: string;
}

export default function ComponentRenderer({ projectId, issueNumber, screenName }: ComponentRendererProps) {
  const Component = dynamic<any>(
    () => import(`@/components/${projectId}/issue-${issueNumber}/${screenName}`).catch(() => {
      return Promise.resolve({
        default: () => (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            height: '100vh',
            fontFamily: 'system-ui, sans-serif',
            textAlign: 'center',
            padding: '20px'
          }}>
            <div>
              <h1>Component Not Found</h1>
              <p>Could not load: {projectId}/issue-{issueNumber}/{screenName}</p>
              <p style={{ marginTop: '20px', color: '#666' }}>
                Make sure the component exists at:<br/>
                <code style={{ background: '#f5f5f5', padding: '4px 8px', borderRadius: '4px' }}>
                  components/{projectId}/issue-{issueNumber}/{screenName}.tsx
                </code>
              </p>
            </div>
          </div>
        )
      });
    }),
    {
      ssr: false,
      loading: () => (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100vh',
          fontFamily: 'system-ui, sans-serif'
        }}>
          <p>Loading component...</p>
        </div>
      ),
    }
  );

  return (
    <Suspense fallback={<div>Loading...</div>}>
      <div style={{ width: '100%', minHeight: '100vh' }}>
        <Component />
      </div>
    </Suspense>
  );
}
