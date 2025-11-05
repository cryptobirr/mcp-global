import ComponentRenderer from './ComponentRenderer';

interface MockupPageProps {
  params: Promise<{
    projectId: string;
    issueNumber: string;
    screenName: string;
  }>;
}

export default async function MockupPage({ params }: MockupPageProps) {
  const { projectId, issueNumber, screenName } = await params;

  return (
    <ComponentRenderer
      projectId={projectId}
      issueNumber={issueNumber}
      screenName={screenName}
    />
  );
}

// Generate metadata for the page
export async function generateMetadata({ params }: MockupPageProps) {
  const { projectId, issueNumber, screenName } = await params;
  return {
    title: `${screenName} - ${projectId} #${issueNumber}`,
    description: `Mockup preview for ${screenName}`,
  };
}
