import React from 'react';

interface State { hasError: boolean }

export class ErrorBoundary extends React.Component<React.PropsWithChildren, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center min-h-screen bg-[#0d1117] text-[#c9d1d9] gap-4 font-mono p-8">
          <span className="text-2xl font-bold text-[#f85149]">Something went wrong</span>
          <span className="text-sm text-[#8b949e] text-center">An unexpected error occurred in the game.</span>
          <button
            className="px-5 py-2 bg-[#21262d] border border-[#30363d] rounded-md text-sm font-semibold cursor-pointer hover:bg-[#30363d] transition-colors"
            onClick={() => window.location.reload()}
          >
            Reload
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
