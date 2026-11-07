import { fireEvent, screen } from '@testing-library/react';

/** M6.8: a new project is the board alone and the parts panel is folded — put down a half breadboard (where new
 *  projects had theirs) and open the panel, as building a circuit starts. */
export function startBuilding(): void {
  fireEvent.click(screen.getByRole('button', { name: 'Add a breadboard' }));
  fireEvent.click(screen.getByRole('button', { name: 'Parts' }));
}
