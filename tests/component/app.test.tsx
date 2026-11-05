import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { App } from '../../src/renderer/src/App';

describe('M0 placeholder window', () => {
  it('shows the app name', () => {
    render(<App />);
    expect(screen.getByRole('heading', { name: 'MicroLab' })).toBeInTheDocument();
  });

  it('says which milestone it is', () => {
    render(<App />);
    expect(screen.getByText(/milestone M0/i)).toBeInTheDocument();
  });
});
