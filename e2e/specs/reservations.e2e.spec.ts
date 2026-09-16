describe('Reservations', () => {
  let jwt: string;

  beforeAll(async () => {
    const user = {
      email: 'sleeprnestapp@gmail.com',
      password: 'StrongPassword123!',
    };

    await fetch('http://auth:3001/users', {
      method: 'POST',
      body: JSON.stringify(user),
      headers: {
        'Content-Type': 'application/json',
      },
    });

    const response = await fetch('http://auth:3001/auth/login', {
      method: 'POST',
      body: JSON.stringify(user),
      headers: {
        'Content-Type': 'application/json',
      },
    });
    jwt = await response.text();
  });

  test('Create & Get', async () => {
    const createdReservation = await createReservation();

    const responseGet = await fetch(
      `http://reservations:3000/reservations/${createdReservation._id}`,
      {
        headers: {
          'Content-Type': 'application/json',
          Authentication: jwt,
        },
      },
    );

    const reservation = (await responseGet.json()) as unknown as {
      _id: string;
    };
    expect(createdReservation).toEqual(reservation);
  });

  const createReservation = async () => {
    const responseCreate = await fetch(
      'http://reservations:3000/reservations',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authentication: jwt,
        },
        body: JSON.stringify({
          startDate: '08/22/2023',
          endDate: '02/12/2024',
          placeId: '13347',
          invoiceId: '143125',
          charge: {
            amount: 20,
            card: {
              token: 'tok_visa',
            },
          },
        }),
      },
    );

    expect(responseCreate.ok).toBeTruthy();

    const createdReservation = (await responseCreate.json()) as unknown as {
      _id: string;
    };

    return createdReservation;
  };
});
