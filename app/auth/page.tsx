// import { useState } from "react";
// import type { User, AuthError, login, signup } from "../../lib/auth";

// import styles from "./page.module.css";


// type Mode = "login" | "signup";

// interface Props {
//   onAuthed: (user: User) => void;
// }

// /** Log in / sign up form. Toggles between the two modes and calls the backend. */
// export default function AuthForm({ onAuthed }: Props) {
//   const [mode, setMode] = useState<Mode>("login");
//   const [identifier, setIdentifier] = useState(""); // login: username or email
//   const [username, setUsername] = useState("");
//   const [email, setEmail] = useState("");
//   const [password, setPassword] = useState("");
//   const [error, setError] = useState<string | null>(null);
//   const [submitting, setSubmitting] = useState(false);

//   function switchMode(next: Mode) {
//     setMode(next);
//     setError(null);
//   }

//   async function handleSubmit(e: React.FormEvent) {
//     e.preventDefault();
//     setError(null);
//     setSubmitting(true);
//     try {
//       const user =
//         mode === "login"
//           ? await login(identifier, password)
//           : await signup(username, email, password);
//       onAuthed(user);
//     } catch (err) {
//       // Show the server's message for expected failures; anything else is a bug
//       // or the backend being unreachable.
//       setError(
//         err instanceof AuthError
//           ? err.message
//           : "Something went wrong. Is the server running?",
//       );
//     } finally {
//       setSubmitting(false);
//     }
//   }

//   return (
//     <form className="auth-form" onSubmit={handleSubmit}>
//       <div className="auth-form__tabs">
//         <button
//           type="button"
//           className={mode === "login" ? "is-active" : ""}
//           onClick={() => switchMode("login")}
//         >
//           Log in
//         </button>
//         <button
//           type="button"
//           className={mode === "signup" ? "is-active" : ""}
//           onClick={() => switchMode("signup")}
//         >
//           Sign up
//         </button>
//       </div>

//       {mode === "login" ? (
//         <input
//           className="auth-form__input"
//           placeholder="Username or email"
//           autoComplete="username"
//           value={identifier}
//           onChange={(e) => setIdentifier(e.target.value)}
//           required
//         />
//       ) : (
//         <>
//           <input
//             className="auth-form__input"
//             placeholder="Username"
//             autoComplete="username"
//             value={username}
//             onChange={(e) => setUsername(e.target.value)}
//             required
//           />
//           <input
//             className="auth-form__input"
//             type="email"
//             placeholder="Email"
//             autoComplete="email"
//             value={email}
//             onChange={(e) => setEmail(e.target.value)}
//             required
//           />
//         </>
//       )}

//       <input
//         className="auth-form__input"
//         type="password"
//         placeholder="Password"
//         autoComplete={mode === "login" ? "current-password" : "new-password"}
//         value={password}
//         onChange={(e) => setPassword(e.target.value)}
//         required
//       />

//       {error && <div className="auth-form__error">{error}</div>}

//       <button className="auth-form__submit" type="submit" disabled={submitting}>
//         {submitting
//           ? "Please wait…"
//           : mode === "login"
//             ? "Log in"
//             : "Sign up"}
//       </button>
//     </form>
//   );
// }
