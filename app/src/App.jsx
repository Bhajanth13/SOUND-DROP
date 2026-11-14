import { useHashRoute } from "./hooks/useHashRoute.js";
import { SoundDropProvider, useSoundDrop } from "./hooks/SoundDropContext.jsx";
import HomePage from "./pages/HomePage.jsx";
import SendPage from "./pages/SendPage.jsx";
import ReceivePage from "./pages/ReceivePage.jsx";

const PAGES = { home: HomePage, send: SendPage, receive: ReceivePage };
const LINKS = [["home", "Home", "#/"], ["send", "Send", "#/send"], ["receive", "Receive", "#/receive"]];

function NavBar({ route }) {
  const { listening } = useSoundDrop();
  return (
    <nav className="navbar py-1 border-bottom bg-body sticky-top">
      <div className="container sd-container flex-nowrap">
        <a className="navbar-brand fw-bold d-flex align-items-center gap-2" href="#/">
          <img src="./icon.svg" width="26" height="26" alt="" /> SoundDrop
        </a>
        <div className="d-flex gap-1">
          {LINKS.map(([id, label, href]) => (
            <a key={id} href={href} className={"nav-link px-1 px-sm-2" + (route === id ? " active fw-semibold" : "")} aria-current={route === id ? "page" : undefined}>
              {label}{id === "receive" && listening && <span className="sd-dot" title="Listening" />}
            </a>
          ))}
        </div>
      </div>
    </nav>
  );
}

export default function App() {
  const route = useHashRoute();
  const Page = PAGES[route];
  return (
    <SoundDropProvider>
      <NavBar route={route} />
      <main className="container sd-container py-2">
        <Page />
      </main>
    </SoundDropProvider>
  );
}
