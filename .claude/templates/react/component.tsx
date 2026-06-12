import React, { useState, useEffect } from 'react';

interface ExampleComponentProps {
  title: string;
  onAction?: (data: string) => void;
  className?: string;
}

export const ExampleComponent: React.FC<ExampleComponentProps> = ({
  title,
  onAction,
  className = '',
}) => {
  const [data, setData] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Fetch data or setup subscriptions
    const fetchData = async () => {
      setLoading(true);
      setError(null);
      try {
        // Replace with actual API call
        const response = await fetch('/api/example');
        const result = await response.json();
        setData(result.data);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'An error occurred');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  const handleAction = () => {
    if (onAction) {
      onAction(data);
    }
  };

  if (loading) {
    return <div className="loading">Loading...</div>;
  }

  if (error) {
    return <div className="error">Error: {error}</div>;
  }

  return (
    <div className={`example-component ${className}`}>
      <h2>{title}</h2>
      <div className="content">
        <p>{data}</p>
      </div>
      <button onClick={handleAction} disabled={!data}>
        Action
      </button>
    </div>
  );
};
