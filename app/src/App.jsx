import { useHashRoute } from "./hooks/useHashRoute.js";
import { SoundDropProvider } from "./hooks/SoundDropContext.jsx";
import { ThemeProvider } from "./hooks/ThemeContext.jsx";
import NavBar from "./components/NavBar.jsx";
import TabBar from "./components/TabBar.jsx";
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
    <ThemeProvider>
      <SoundDropProvider>
        <div className="sd-app" data-route={route}>
          <NavBar route={route} />
          <main className="sd-container sd-main">
            <Page />
          </main>
          <footer className="sd-container sd-footer">
            SoundDrop: CS1309 Web Technology mini project by Bhajanth V, RV University
          </footer>
          <TabBar route={route} />
        </div>
      </SoundDropProvider>
    </ThemeProvider>
  );
}
