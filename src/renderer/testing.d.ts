declare module "@testing-library/user-event" {
  type User = { click(target: Element): Promise<void> };
  const userEvent: { setup(): User };
  export default userEvent;
}
