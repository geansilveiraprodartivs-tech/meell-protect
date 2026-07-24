import { Component, type ReactNode } from 'react';
import { Shield, RefreshCw } from 'lucide-react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-meell-50 to-lilas-50 p-6">
          <div className="card max-w-md text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-rose-500 to-rose-400 text-white">
              <Shield size={28} />
            </div>
            <h1 className="mt-4 text-xl font-bold text-meell-800">Algo deu errado</h1>
            <p className="mt-2 text-sm text-meell-500">
              Ocorreu um erro inesperado. Tente recarregar a página.
            </p>
            {this.state.error && (
              <pre className="mt-3 max-h-32 overflow-auto rounded-2xl bg-meell-50 p-3 text-left text-xs text-meell-400">
                {this.state.error.message}
              </pre>
            )}
            <button
              onClick={() => window.location.reload()}
              className="btn-primary mt-5"
            >
              <RefreshCw size={16} /> Recarregar
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
