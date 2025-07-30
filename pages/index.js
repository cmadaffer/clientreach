import { useSession, signIn, signOut } from "next-auth/react";

export default function Home() {
  const { data: session } = useSession();

  if (!session) {
    return (
      <div style={{ padding: 40 }}>
        <h1>ClientReach Assistant</h1>
        <p>Log in to connect your Gmail and start sending follow-ups.</p>
        <button onClick={() => signIn("google")}>Sign in with Google</button>
      </div>
    );
  }

  return (
    <div style={{ padding: 40 }}>
      <h1>Welcome, {session.user.name}</h1>
      <p>You are connected to Gmail!</p>
      <button onClick={() => signOut()}>Sign out</button>
    </div>
  );
}
