export default {
  title: 'Design System/Button',
};

export const Primary = () => {
  const button = document.createElement('button');
  button.textContent = 'Start automation';
  button.style.backgroundColor = 'var(--color-accent)';
  button.style.border = '0';
  button.style.borderRadius = 'var(--radius-md)';
  button.style.color = 'var(--color-text-inverse)';
  button.style.padding = 'var(--space-2) var(--space-4)';
  return button;
};
