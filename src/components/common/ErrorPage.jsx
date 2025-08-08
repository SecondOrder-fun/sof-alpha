import PropTypes from 'prop-types';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';

const ErrorPage = ({ error, resetErrorBoundary }) => {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-background text-foreground p-4">
      <div className="max-w-md w-full space-y-8">
        <div className="text-center">
          <h1 className="text-4xl font-bold tracking-tight sm:text-5xl md:text-6xl">
            <span className="block">Oops!</span>
            <span className="block text-primary mt-2">Something went wrong</span>
          </h1>
          <p className="mt-6 text-lg text-muted-foreground">
            We&apos;re sorry, but an unexpected error has occurred.
          </p>
        </div>
        
        {error && (
          <div className="mt-8 p-4 bg-destructive/10 rounded-lg border border-destructive/20">
            <h2 className="text-lg font-semibold text-destructive">Error Details</h2>
            <p className="mt-2 text-sm text-destructive">{error.message}</p>
          </div>
        )}
        
        <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4">
          <Button onClick={resetErrorBoundary} size="lg">
            Try Again
          </Button>
          <Button asChild variant="outline" size="lg">
            <Link to="/">Go Home</Link>
          </Button>
        </div>
      </div>
    </div>
  );
};

ErrorPage.propTypes = {
  error: PropTypes.shape({
    message: PropTypes.string.isRequired
  }),
  resetErrorBoundary: PropTypes.func.isRequired
};

export default ErrorPage;