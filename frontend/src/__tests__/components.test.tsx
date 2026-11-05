// The reusable UI kit in src/components (from the Alfred mock UI / Figma).
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { Button } from "../components/Button";
import { Card } from "../components/Card";
import { Chip } from "../components/Chip";
import { ChoiceChips } from "../components/ChoiceChips";
import { KeyValueList } from "../components/KeyValueList";
import { PrincipalLogo } from "../components/Logo";
import { ProgressBar } from "../components/ProgressBar";
import { StatusTag } from "../components/StatusTag";
import { TabPanel, Tabs } from "../components/Tabs";
import { Textarea } from "../components/Textarea";
import { TextField } from "../components/TextField";

afterEach(cleanup);

describe("Button", () => {
  it("is a non-submitting button by default and passes clicks through", () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Save</Button>);
    const button = screen.getByRole("button", { name: "Save" });
    expect(button.getAttribute("type")).toBe("button");
    fireEvent.click(button);
    expect(onClick).toHaveBeenCalledOnce();
  });

  it("applies each variant's look, and lets className add to it", () => {
    render(
      <>
        <Button variant="primary">Primary</Button>
        <Button variant="secondary">Secondary</Button>
        <Button variant="ai">AI</Button>
        <Button variant="ghost" size="icon" aria-label="Icon" className="extra" />
      </>,
    );
    expect(screen.getByRole("button", { name: "Primary" }).className).toMatch(/\bbg-primary\b/);
    expect(screen.getByRole("button", { name: "Secondary" }).className).toMatch(/\bborder-primary\b/);
    expect(screen.getByRole("button", { name: "AI" }).className).toMatch(/\bbg-ai\b/);
    const icon = screen.getByRole("button", { name: "Icon" });
    expect(icon.className).toMatch(/\bsize-8\b/);
    expect(icon.className).toMatch(/\bextra\b/);
  });

  it("does not fire clicks when disabled", () => {
    const onClick = vi.fn();
    render(
      <Button disabled onClick={onClick}>
        Save
      </Button>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(onClick).not.toHaveBeenCalled();
  });
});

describe("Chip", () => {
  it("reflects selected state with aria-pressed and is plain when not a toggle", () => {
    render(
      <>
        <Chip selected>9% · $1.55M, on track</Chip>
        <Chip selected={false}>8% · $1.45M, $50K to go</Chip>
        <Chip>Plain</Chip>
      </>,
    );
    expect(screen.getByRole("button", { name: /9%/ }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("button", { name: /8%/ }).getAttribute("aria-pressed")).toBe("false");
    expect(screen.getByRole("button", { name: "Plain" }).hasAttribute("aria-pressed")).toBe(false);
  });
});

describe("ChoiceChips", () => {
  const options = [
    { value: "a", label: "Apple" },
    { value: "b", label: "Banana" },
  ] as const;

  function Harness({ onChange }: { onChange: (v: string) => void }) {
    const [value, setValue] = useState<"a" | "b" | "">("");
    return (
      <ChoiceChips
        label="Fruit"
        options={options}
        value={value}
        onChange={(v) => {
          setValue(v);
          onChange(v);
        }}
      />
    );
  }

  it("is a labelled radio group with one radio per option", () => {
    render(<Harness onChange={() => {}} />);
    const group = screen.getByRole("radiogroup", { name: "Fruit" });
    expect(Array.from(group.querySelectorAll("[role=radio]")).map((r) => r.textContent)).toEqual(["Apple", "Banana"]);
  });

  it("selects one option at a time, and clears it when chosen again", () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    fireEvent.click(screen.getByRole("radio", { name: "Apple" }));
    expect(screen.getByRole("radio", { name: "Apple" }).getAttribute("aria-checked")).toBe("true");
    fireEvent.click(screen.getByRole("radio", { name: "Banana" }));
    expect(screen.getByRole("radio", { name: "Apple" }).getAttribute("aria-checked")).toBe("false");
    fireEvent.click(screen.getByRole("radio", { name: "Banana" }));
    expect(onChange.mock.calls.map((c) => c[0])).toEqual(["a", "b", ""]);
  });
});

describe("TextField", () => {
  it("labels its input", () => {
    render(<TextField label="Username" />);
    expect(screen.getByRole("textbox", { name: "Username" })).toBeTruthy();
  });

  it("shows an error, marks the input invalid and links the message to it", () => {
    render(<TextField label="Username" error="Enter your username." />);
    const input = screen.getByRole("textbox", { name: "Username" });
    expect(input.getAttribute("aria-invalid")).toBe("true");
    const message = document.getElementById(input.getAttribute("aria-describedby")!)!;
    expect(message.textContent).toBe("Enter your username.");
  });
});

describe("Textarea", () => {
  it("is a multi-line text box that keeps native attributes", () => {
    render(<Textarea aria-label="Comment" maxLength={10} />);
    const box = screen.getByRole("textbox", { name: "Comment" }) as HTMLTextAreaElement;
    expect(box.tagName).toBe("TEXTAREA");
    expect(box.maxLength).toBe(10);
  });
});

describe("Tabs", () => {
  const tabs = [
    { id: "overview", label: "Overview" },
    { id: "retirement", label: "Retirement" },
  ] as const;

  it("calls onChange with the clicked tab id", () => {
    const onChange = vi.fn();
    render(
      <Tabs label="Sections" tabs={tabs} active="overview" onChange={onChange}>
        <TabPanel id="overview">Overview body</TabPanel>
        <TabPanel id="retirement">Retirement body</TabPanel>
      </Tabs>,
    );
    expect(screen.getByRole("tablist", { name: "Sections" })).toBeTruthy();
    const trigger = screen.getByRole("tab", { name: "Retirement" });
    fireEvent.mouseDown(trigger, { button: 0 });
    fireEvent.click(trigger);
    expect(onChange).toHaveBeenCalledWith("retirement");
  });

  it("shows only the active panel", () => {
    render(
      <Tabs label="Sections" tabs={tabs} active="retirement" onChange={() => {}}>
        <TabPanel id="overview">Overview body</TabPanel>
        <TabPanel id="retirement">Retirement body</TabPanel>
      </Tabs>,
    );
    expect(screen.getByText("Retirement body")).toBeTruthy();
    expect(screen.queryByText("Overview body")).toBeNull();
  });
});

describe("display components", () => {
  it("StatusTag renders its label in the tone's colors", () => {
    render(<StatusTag tone="warning">Needs attention</StatusTag>);
    expect(screen.getByText("Needs attention").className).toMatch(/\bbg-warning-100\b/);
  });

  it("ProgressBar exposes its value and clamps it to 0-100", () => {
    render(
      <>
        <ProgressBar value={140} label="Too high" />
        <ProgressBar value={-5} label="Too low" />
        <ProgressBar value={66.6} label="Rounded" />
      </>,
    );
    expect(screen.getByRole("progressbar", { name: "Too high" }).getAttribute("aria-valuenow")).toBe("100");
    expect(screen.getByRole("progressbar", { name: "Too low" }).getAttribute("aria-valuenow")).toBe("0");
    expect(screen.getByRole("progressbar", { name: "Rounded" }).getAttribute("aria-valuenow")).toBe("67");
  });

  it("KeyValueList renders each label and value as a definition pair", () => {
    render(
      <KeyValueList
        rows={[
          { label: "About each month", value: "$312" },
          { label: "Automatic increases", value: "Off" },
        ]}
      />,
    );
    expect(Array.from(document.querySelectorAll("dt")).map((d) => d.textContent)).toEqual([
      "About each month",
      "Automatic increases",
    ]);
    expect(Array.from(document.querySelectorAll("dd")).map((d) => d.textContent)).toEqual(["$312", "Off"]);
  });

  it("Card renders a section with the chosen surface", () => {
    render(
      <>
        <Card aria-label="Panel">a</Card>
        <Card aria-label="Tile" variant="tile">
          b
        </Card>
      </>,
    );
    expect(screen.getByRole("region", { name: "Panel" }).className).toMatch(/\bborder-line\b/);
    expect(screen.getByRole("region", { name: "Tile" }).className).toMatch(/\bshadow-card\b/);
  });

  it("PrincipalLogo is an image named Principal", () => {
    render(<PrincipalLogo />);
    expect(screen.getByRole("img", { name: "Principal" })).toBeTruthy();
  });
});
