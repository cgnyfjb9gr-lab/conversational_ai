import { useState } from "react";

import { LoginPage } from "@/auth/LoginPage";
import { getUser, signIn, signOut, type User } from "@/auth/user";
import { ChatApp } from "@/chat/ChatApp";

/** Shows the (demo) sign-in page until someone signs in, then the Alfred chat. */
export default function App() {
  const [user, setUser] = useState<User | null>(getUser);

  if (!user) return <LoginPage onSignIn={(username) => setUser(signIn(username))} />;
  return (
    <ChatApp
      user={user}
      onSignOut={() => {
        signOut();
        setUser(null);
      }}
    />
  );
}
