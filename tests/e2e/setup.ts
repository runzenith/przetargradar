export default async function setup() {
  const response = await fetch('http://127.0.0.1:5173/api/ready');
  if (!response.ok) throw new Error('E2E requires a running DEMO API, database and seed.');
  const state = (await response.json()) as {
    mode: string;
  };
  if (state.mode !== 'DEMO')
    throw new Error(
      'Refusing E2E against LIVE. Start a separate DEMO instance with PUBLIC_ORIGIN=http://127.0.0.1:5173.',
    );
}
