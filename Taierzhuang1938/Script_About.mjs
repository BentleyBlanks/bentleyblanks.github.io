import { ABOUT_PAGES, ABOUT_SOURCES } from "./Data_About.mjs";
import { T } from "./Script_Text.mjs";

function Element(tag, className, parent, text) {
  const element = document.createElement(tag);
  element.className = className;
  if (text != null) element.textContent = text;
  parent?.append(element);
  return element;
}

/** A reusable reading panel. It never loads gameplay, models, audio or remote embeds. */
export class AboutDossier {
  constructor({ onHistory }) {
    this.onHistory = onHistory;
    this.selected = "work";
    this.details = false;
    this.root = Element("div", "aboutDossier");
    this.nav = Element("div", "aboutTabs", this.root);
    this.nav.setAttribute("role", "tablist");
    this.nav.setAttribute("aria-label", T("about.navigation"));
    this.nav.setAttribute("aria-orientation", "vertical");
    this.tabs = ABOUT_PAGES.map(page => {
      const button = Element("button", "aboutTab", this.nav, T(page.labelKey));
      button.type = "button"; button.id = "aboutTab-" + page.id; button.dataset.about = page.id;
      button.setAttribute("role", "tab"); button.setAttribute("aria-controls", "aboutPaper");
      button.addEventListener("click", () => this.Select(page.id));
      return button;
    });
    this.paper = Element("section", "aboutPaper", this.root);
    this.paper.id = "aboutPaper"; this.paper.setAttribute("role", "tabpanel");
    this.reader = Element("div", "aboutReader", this.paper);
    this.reader.tabIndex = 0; this.reader.setAttribute("aria-label", T("about.reader"));
    this.footer = Element("div", "aboutPaperFooter", this.paper);
    this.action = Element("button", "aboutAction", this.footer);
    this.action.type = "button"; this.action.addEventListener("click", () => this.Activate());
    this.folio = Element("span", "aboutFolio", this.footer);
    // Arrow keys stay native inside the reading region, including attribution links.
    this.root.addEventListener("keydown", event => this.Key(event));
    this.Select(this.selected);
  }

  Select(id, { focus = false } = {}) {
    const page = ABOUT_PAGES.find(item => item.id === id) || ABOUT_PAGES[0];
    this.selected = page.id; this.details = false;
    this.Render();
    if (focus) this.tabs.find(tab => tab.dataset.about === page.id)?.focus({ preventScroll: true });
  }

  Render() {
    const page = ABOUT_PAGES.find(item => item.id === this.selected);
    this.tabs.forEach(tab => {
      const active = tab.dataset.about === page.id;
      tab.setAttribute("aria-selected", String(active)); tab.tabIndex = active ? 0 : -1;
    });
    this.paper.setAttribute("aria-labelledby", "aboutTab-" + page.id);
    this.root.dataset.page = page.id;
    this.reader.replaceChildren();
    const header = Element("header", "aboutPaperHead", this.reader);
    Element("h2", "aboutHeading", header, T(this.details ? "about.details.title" : page.titleKey));
    Element("p", "aboutSubtitle", header, T(this.details ? "about.details.intro" : page.subtitleKey));
    if (this.details) {
      this.reader.classList.add("aboutSources");
      for (const source of ABOUT_SOURCES) {
        const item = Element("section", "aboutSource", this.reader);
        Element("h3", "aboutSourceName", item, T(source.nameKey));
        Element("p", "aboutSourceCredit", item, T(source.creditKey) + " · " + T(source.licenseKey));
        const links = Element("div", "aboutSourceLinks", item);
        for (const [url, label] of [[source.url, "about.details.source"], [source.licenseUrl, "about.details.license"]]) {
          const anchor = Element("a", "", links, T(label));
          anchor.href = url; anchor.target = "_blank"; anchor.rel = "noopener noreferrer";
        }
      }
    } else {
      this.reader.classList.remove("aboutSources");
      for (const group of page.sections) {
        const section = Element("section", "aboutSection", this.reader);
        Element("h3", "", section, T(group.titleKey));
        if (group.authors) {
          const credits = Element("dl", "aboutAuthors", section);
          for (const id of ["studio", "producer"]) {
            Element("dt", "", credits, T(`about.${id}.label`));
            Element("dd", "", credits, T(`about.${id}.name`));
          }
        }
        group.lines.forEach(key => Element("p", "", section, T(key)));
      }
      if (page.dedicationKey) Element("p", "aboutDedication", this.reader, T(page.dedicationKey));
    }
    this.action.textContent = T(this.details ? "about.details.back" : page.actionKey);
    this.folio.textContent = T("about.page", {
      current: String(ABOUT_PAGES.indexOf(page) + 1).padStart(2, "0"), total: String(ABOUT_PAGES.length).padStart(2, "0"),
    });
    this.reader.scrollTop = 0;
  }

  Activate() {
    if (this.details) { this.details = false; this.Render(); return; }
    if (this.selected === "work") this.Select("credits", { focus: true });
    else if (this.selected === "credits") this.Select("licenses", { focus: true });
    else if (this.selected === "history") this.onHistory();
    else { this.details = true; this.Render(); this.reader.focus({ preventScroll: true }); }
  }

  Back() {
    if (!this.details) return false;
    this.details = false; this.Render(); this.action.focus({ preventScroll: true }); return true;
  }

  Key(event) {
    if (event.key === "Escape") return;
    const tab = event.target.closest(".aboutTab");
    if (tab && ["ArrowDown", "ArrowUp", "ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) {
      let index = ABOUT_PAGES.findIndex(page => page.id === tab.dataset.about);
      if (event.key === "Home") index = 0;
      else if (event.key === "End") index = ABOUT_PAGES.length - 1;
      else index = (index + (["ArrowDown", "ArrowRight"].includes(event.key) ? 1 : -1) + ABOUT_PAGES.length) % ABOUT_PAGES.length;
      this.Select(ABOUT_PAGES[index].id, { focus: true });
      event.preventDefault();
    }
    // The parent menu's arrow handling must not eat reader scrolling.
    event.stopPropagation();
  }

  Open() {
    this.Render();
    this.tabs.find(tab => tab.dataset.about === this.selected)?.focus({ preventScroll: true });
  }
}
