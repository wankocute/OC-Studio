import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { messages } from "@/i18n";

import { CharacterCard } from "./character-card";

describe("CharacterCard", () => {
  it("renders name, initials, summary and tags", () => {
    render(
      <CharacterCard
        name="Lê Minh Châu"
        summary="Một kiếm khách lang bạt."
        tags={["kiếm khách"]}
      />,
    );
    expect(screen.getByText("Lê Minh Châu")).toBeInTheDocument();
    expect(screen.getByText("LC")).toBeInTheDocument();
    expect(screen.getByText("Một kiếm khách lang bạt.")).toBeInTheDocument();
    expect(screen.getByText("kiếm khách")).toBeInTheDocument();
  });

  it("collapses extra tags into a counter", () => {
    render(<CharacterCard name="A" tags={["1", "2", "3", "4", "5"]} />);
    expect(screen.getByText("+2")).toBeInTheDocument();
    expect(screen.queryByText("4")).not.toBeInTheDocument();
  });

  it("falls back to a placeholder name when blank", () => {
    render(<CharacterCard name="   " />);
    expect(screen.getByText(messages.characters.untitled)).toBeInTheDocument();
  });

  it("renders the name as a link when href is provided", () => {
    render(<CharacterCard name="Châu" href="/characters" />);
    expect(screen.getByRole("link", { name: "Châu" })).toHaveAttribute("href", "/characters");
  });
});
