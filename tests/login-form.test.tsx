// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LoginForm } from "@/app/login/login-form";

const signIn = vi.hoisted(() => vi.fn());
const push = vi.hoisted(() => vi.fn());
vi.mock("next-auth/react", () => ({ signIn }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("LoginForm", () => {
  it("validates inputs before calling signIn", async () => {
    const user = userEvent.setup();
    render(<LoginForm sso={null} />);
    await user.click(screen.getByRole("button", { name: /sign in/i }));
    expect(await screen.findByText(/enter your university email/i)).toBeTruthy();
    expect(signIn).not.toHaveBeenCalled();
  });

  it("shows an error on failed sign-in", async () => {
    signIn.mockResolvedValue({ error: "CredentialsSignin" });
    const user = userEvent.setup();
    render(<LoginForm sso={null} />);
    await user.type(screen.getByLabelText(/email/i), "joe@vt.edu");
    await user.type(screen.getByLabelText(/password/i), "wrong");
    await user.click(screen.getByRole("button", { name: /sign in/i }));
    expect(await screen.findByText(/invalid email or password/i)).toBeTruthy();
  });

  it("redirects on success", async () => {
    signIn.mockResolvedValue({ ok: true });
    const user = userEvent.setup();
    render(<LoginForm sso={null} />);
    await user.type(screen.getByLabelText(/email/i), "joe@vt.edu");
    await user.type(screen.getByLabelText(/password/i), "password123");
    await user.click(screen.getByRole("button", { name: /sign in/i }));
    await waitFor(() => expect(push).toHaveBeenCalledWith("/"));
  });
});
