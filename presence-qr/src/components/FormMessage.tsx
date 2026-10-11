export function FormMessage({ error, success }: { error?: string; success?: string }) {
  if (error) {
    return (
      <p role="alert" className="form-error">
        {error}
      </p>
    );
  }
  if (success) {
    return (
      <p role="status" className="form-success">
        {success}
      </p>
    );
  }
  return null;
}
