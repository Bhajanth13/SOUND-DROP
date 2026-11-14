import { useHashRoute } from "./hooks/useHashRoute.js";
import { SoundDropProvider } from "./hooks/SoundDropContext.jsx";
import NavBar from "./components/NavBar.jsx";
import HomePage from "./pages/HomePage.jsx";
import SendPage from "./pages/SendPage.jsx";
import ReceivePage from "./pages/ReceivePage.jsx";
import LabPage from "./pages/LabPage.jsx";
import AboutPage from "./pages/AboutPage.jsx";

const PAGES = { home: HomePage, send: SendPage, receive: ReceivePage, lab: LabPage, about: AboutPage };
const TITLES = { home: "SoundDrop", send: "Send · SoundDrop", receive: "Receive · SoundDrop", lab: "Range Test Lab · SoundDrop", about: "How it works · SoundDrop" };

export default function App() {
  const route = useHashRoute();
  const Page = PAGES[route];
  document.title = TITLES[route];
  return (
    <SoundDropProvider>
      <NavBar route={route} />
      <main className="container sd-container">
        <Page />
      </main>
      <footer className="container sd-container sd-footer">
        SoundDrop · CS1309 Web Technology mini project · Bhajanth V (RVUM26CSE062), RV University
      </footer>
    </SoundDropProvider>
  );
}
